"""
Issue service for managing issue-related business logic.
"""

import logging
from typing import Dict, Any, Optional
from firebase_admin import firestore
from google.cloud.firestore_v1.transforms import Increment
from core.database import get_firestore_client, get_elasticsearch_client

logger = logging.getLogger(__name__)


async def upvote_issue(issue_id: str, user_id: str) -> Dict[str, Any]:
    """
    Upvote an issue and update the count within a Firestore transaction.
    This is now the single source of truth.
    """
    db = get_firestore_client()
    if not db:
        raise Exception("Firestore client not available")

    if not issue_id or not user_id:
        return {"success": False, "message": "Missing issue_id or user_id"}

    issue_ref = db.collection("issues").document(issue_id)
    upvote_ref = db.collection("upvotes").document(f"{issue_id}__{user_id}")
    report_ref = db.collection("reports").document(f"{issue_id}__{user_id}")

    # --- SELF-HEALING LOGIC (Async part) ---
    # Perform this check outside the transaction.
    issue_snapshot = issue_ref.get()
    if not issue_snapshot.exists:
        logger.warning(f"Issue {issue_id} not found in Firestore. Attempting to create from Elasticsearch.")
        es_client = get_elasticsearch_client()
        try:
            # Correctly await the async call
            es_resp = await es_client.get(index="issues", id=issue_id)
            issue_data_from_es = es_resp.get("_source", {})

            # Only persist minimal fields required by backend logic in Firestore
            initial_data = {
                "status": (issue_data_from_es.get("status") or "open"),
                # Aggregated counters as the single source of truth
                "upvotes": {"open": 0, "closed": 0},
                "reports": {"open": 0, "closed": 0},
                # Moderation flags managed by thresholds
                "hidden_for_review": False,
                "spam": False,
            }
            issue_ref.set(initial_data)
            logger.info(f"Successfully created missing issue {issue_id} in Firestore.")
        except Exception as es_error:
            logger.error(f"Failed to fetch issue {issue_id} from Elasticsearch to self-heal: {es_error}")
            raise Exception(f"Issue {issue_id} not found in Firestore and could not be retrieved from ES.")

    try:
        @firestore.transactional
        def _toggle_upvote_transaction(transaction):
            # 1. Get the current state of the issue and the upvote
            # The issue document is now guaranteed to exist.
            issue_snapshot = issue_ref.get(transaction=transaction)
            upvote_snapshot = upvote_ref.get(transaction=transaction)
            report_snapshot = report_ref.get(transaction=transaction)

            issue_data = issue_snapshot.to_dict()
            issue_status = issue_data.get("status", "open").lower()
            upvote_field = "closed" if issue_status == "closed" else "open"
            
            is_active = upvote_snapshot.exists and upvote_snapshot.to_dict().get("isActive", False)
            new_active_state = not is_active

            # 2. Update the individual upvote document
            if new_active_state:
                transaction.set(upvote_ref, {
                    "issue_id": issue_id,
                    "user_id": user_id,
                    "isActive": True,
                    "upvotedAt": firestore.SERVER_TIMESTAMP,
                }, merge=True)
            else:
                transaction.update(upvote_ref, {"isActive": False})

            # 3. Update the aggregated count on the issue document
            increment = 1 if new_active_state else -1
            transaction.update(issue_ref, {f"upvotes.{upvote_field}": Increment(increment)})

            # 4. Enforce exclusivity: If activating upvote, deactivate any active report by the user
            if new_active_state and report_snapshot.exists:
                prev_report = report_snapshot.to_dict() or {}
                if prev_report.get("isActive"):
                    old_reason = prev_report.get("reason")
                    old_report_field = "closed" if old_reason == "not_fixed" else "open"
                    # Decrement reports aggregate and deactivate report
                    transaction.update(issue_ref, {f"reports.{old_report_field}": Increment(-1)})
                    transaction.update(report_ref, {"isActive": False})
            
            # Return the final state for the response
            return new_active_state, issue_data, upvote_field

        # Execute the transaction
        new_active_state, issue_data, upvote_field = _toggle_upvote_transaction(db.transaction())

        # 4. Post-transaction: Award karma (side effect, doesn't need to be transactional)
        if new_active_state and issue_data.get("status", "open").lower() == "open":
            reporter_id = issue_data.get("reported_by")
            # If reporter_id isn't stored in Firestore (by design), fetch it from Elasticsearch
            if not reporter_id:
                try:
                    es_client = get_elasticsearch_client()
                    es_resp = await es_client.get(index="issues", id=issue_id)
                    reporter_id = (es_resp.get("_source", {}) or {}).get("reported_by")
                except Exception as es_error:
                    logger.warning(f"Could not fetch reporter_id from ES for {issue_id}: {es_error}")
                    reporter_id = None

            if reporter_id and reporter_id != "anonymous" and reporter_id != user_id:
                _award_karma_for_upvote(reporter_id, issue_id)

        # 5. Get the final, updated count for the response
        final_issue_snapshot = issue_ref.get()
        final_upvotes = final_issue_snapshot.to_dict().get("upvotes", {})
        final_count = final_upvotes.get(upvote_field, 0)

        logger.info(f"User {user_id} toggled upvote for {issue_id} to {new_active_state}. New count: {final_count}")

        return {
            "success": True,
            "message": "Upvote toggled successfully",
            "upvote_count": final_count,
            "isActive": new_active_state,
            "hasUpvoted": new_active_state,
            "upvotes": final_upvotes,
        }

    except Exception as e:
        logger.exception(f"Error in upvote transaction for issue {issue_id}: {e}")
        raise Exception(f"Failed to toggle upvote for issue {issue_id}")


async def report_issue(issue_id: str, user_id: str, reason: Optional[str] = None) -> Dict[str, Any]:
    """
    Report an issue and update the count within a Firestore transaction.
    A user can only have one active report per issue. If they report again
    with a different reason (e.g., 'not_fixed' after 'spam'), the new
    report replaces the old one.
    """
    db = get_firestore_client()
    if not db:
        raise Exception("Firestore client not available")

    if not issue_id or not user_id:
        return {"success": False, "message": "Missing issue_id or user_id"}

    issue_ref = db.collection("issues").document(issue_id)
    report_ref = db.collection("reports").document(f"{issue_id}__{user_id}")
    upvote_ref = db.collection("upvotes").document(f"{issue_id}__{user_id}")

    # Self-healing logic similar to upvote_issue
    issue_snapshot = issue_ref.get()
    if not issue_snapshot.exists:
        logger.warning(f"Issue {issue_id} not found in Firestore for report. Attempting to create from Elasticsearch.")
        es_client = get_elasticsearch_client()
        try:
            es_resp = await es_client.get(index="issues", id=issue_id)
            issue_data_from_es = es_resp.get("_source", {})
            # Only store minimal fields required by backend logic
            initial_data = {
                "status": (issue_data_from_es.get("status") or "open"),
                "upvotes": {"open": 0, "closed": 0},
                "reports": {"open": 0, "closed": 0},
                "hidden_for_review": False,
                "spam": False,
            }
            issue_ref.set(initial_data)
            logger.info(f"Successfully created missing issue {issue_id} in Firestore before reporting.")
        except Exception as es_error:
            logger.error(f"Failed to fetch issue {issue_id} from Elasticsearch to self-heal for report: {es_error}")
            raise Exception(f"Issue {issue_id} not found and could not be retrieved from ES for report.")

    try:
        @firestore.transactional
        def _report_issue_transaction(transaction):
            issue_snapshot = issue_ref.get(transaction=transaction)
            report_snapshot = report_ref.get(transaction=transaction)
            upvote_snapshot = upvote_ref.get(transaction=transaction)

            if not issue_snapshot.exists:
                 # This should ideally not be hit due to self-healing, but as a safeguard.
                raise Exception(f"Issue {issue_id} not found")

            issue_data = issue_snapshot.to_dict()
            issue_status = issue_data.get("status", "open").lower()
            new_report_reason = reason or ("not_fixed" if issue_status == "closed" else "spam")

            previous_report_data = report_snapshot.to_dict() if report_snapshot.exists else {}
            is_already_reported_with_same_reason = (
                report_snapshot.exists
                and previous_report_data.get("isActive")
                and previous_report_data.get("reason") == new_report_reason
            )

            if is_already_reported_with_same_reason:
                return None  # Sentinel to indicate no change needed

            # Deactivate previous report if reason is different
            if report_snapshot.exists and previous_report_data.get("isActive"):
                old_report_reason = previous_report_data.get("reason")
                old_report_status_field = "closed" if old_report_reason == "not_fixed" else "open"
                transaction.update(issue_ref, {f"reports.{old_report_status_field}": Increment(-1)})

            # Set the new active report
            transaction.set(report_ref, {
                "issue_id": issue_id,
                "user_id": user_id,
                "reason": new_report_reason,
                "isActive": True,
                "reportedAt": firestore.SERVER_TIMESTAMP,
            }, merge=True)

            # Increment the new report counter
            new_report_status_field = "closed" if new_report_reason == "not_fixed" else "open"
            transaction.update(issue_ref, {f"reports.{new_report_status_field}": Increment(1)})

            # Enforce exclusivity: Deactivate any active upvote by the same user
            if upvote_snapshot.exists and (upvote_snapshot.to_dict() or {}).get("isActive"):
                upvote_field = "closed" if issue_status == "closed" else "open"
                transaction.update(issue_ref, {f"upvotes.{upvote_field}": Increment(-1)})
                transaction.update(upvote_ref, {"isActive": False})
            
            return issue_data, new_report_status_field

        # Execute transaction
        result = _report_issue_transaction(db.transaction())

        if result is None:
            logger.warning(f"User {user_id} already reported {issue_id} with the same reason.")
            return {
                "success": False,
                "message": "You have already reported this issue for the same reason.",
                "hasReported": True,
                "isActive": True,
            }

        issue_data, report_field = result
        
        # 3. Post-transaction: Handle threshold-based actions
        final_issue_snapshot = issue_ref.get()
        final_reports = final_issue_snapshot.to_dict().get("reports", {})
        final_count = final_reports.get(report_field, 0)
        
        actions = _handle_report_thresholds(
            issue_id, issue_ref, issue_data, final_count
        )

        logger.info(f"User {user_id} reported issue {issue_id}. New count: {final_count}")

        return {
            "success": True,
            "message": "Issue reported successfully",
            "hasReported": True,
            "isActive": True,
            **({"actions": actions} if actions else {}),
        }

    except Exception as e:
        logger.exception(f"Error in report transaction for issue {issue_id}: {e}")
        raise Exception(f"Failed to report issue {issue_id}")


def _award_karma_for_upvote(reporter_id: str, issue_id: str):
    """Helper to award karma for an upvote, safely."""
    try:
        db = get_firestore_client()
        reporter_ref = db.collection("users").document(reporter_id)
        reporter_doc = reporter_ref.get()
        if reporter_doc.exists:
            reporter_ref.update({"karma": Increment(5)})
            logger.info(f"Awarded 5 karma to reporter {reporter_id} for upvote on {issue_id}")
        else:
            logger.warning(f"Reporter {reporter_id} not found, cannot award karma.")
    except Exception as e:
        logger.error(f"Failed to award karma to reporter {reporter_id}: {e}")


def _handle_report_thresholds(issue_id: str, issue_ref, issue_data: Dict, report_count: int) -> Dict:
    """Helper to manage side effects of hitting report thresholds."""
    actions = {}
    issue_status = issue_data.get("status", "open").lower()
    
    REPORT_THRESHOLD_OPEN_HIDE = 5
    REPORT_THRESHOLD_CLOSED_REOPEN = 5

    # Threshold 1: Open issue gets hidden as spam
    if issue_status == "open" and report_count >= REPORT_THRESHOLD_OPEN_HIDE:
        try:
            issue_ref.update({"hidden_for_review": True, "spam": True})
            actions["hidden_for_review"] = True
            actions["marked_as_spam"] = True
            logger.info(f"Issue {issue_id} marked as spam after {report_count} reports")
        except Exception as e:
            logger.error(f"Failed to mark issue as spam for {issue_id}: {e}")

    # Threshold 2: Closed issue reported as not fixed -> reopen
    elif issue_status == "closed" and report_count >= REPORT_THRESHOLD_CLOSED_REOPEN:
        try:
            issue_ref.update({
                "status": "open",
                "hidden_for_review": False,
                "closed_by": None,
                "closed_at": None,
            })
            actions["reopened"] = True
            logger.info(f"Issue {issue_id} reopened after {report_count} 'not fixed' reports")
            # Note: Karma reversal logic could be added here if needed
        except Exception as e:
            logger.error(f"Failed to reopen issue {issue_id}: {e}")
            
    return actions


# This function is now deprecated as logic is merged into upvote_issue
async def remove_upvote(issue_id: str, user_id: str) -> Dict[str, Any]:
    """
    DEPRECATED: The `upvote_issue` function now handles toggling.
    This function is kept for reference but should not be used.
    """
    logger.warning("Call to deprecated function `remove_upvote`")
    return await upvote_issue(issue_id, user_id)


async def toggle_upvote(issue_id: str, user_id: str) -> Dict[str, Any]:
    """
    This function now directly calls the new transactional upvote_issue function,
    which handles both adding and removing upvotes.
    """
    return await upvote_issue(issue_id, user_id)


