"""
Issue service for managing issue-related business logic.
"""

import logging
from typing import Dict, Any, Optional, List
from firebase_admin import firestore
from google.cloud.firestore_v1.transforms import Increment
from core.database import get_firestore_client, get_elasticsearch_client

logger = logging.getLogger(__name__)


async def upvote_issue(issue_id: str, user_id: str) -> Dict[str, Any]:
    """
    Upvote an issue and update Firestore.

    For OPEN issues: Normal upvote/like.
    For CLOSED issues: "Is Fixed?" vote. If 5+ votes, mark as done/verified.

    Contract:
    - Inputs: issue_id (str), user_id (str)
    - Side effects: creates/updates a doc in collection `upvotes` with id `{issue_id}__{user_id}`
      and toggles isActive to True; increments issue doc field `upvotes.open|closed` accordingly.
    - Returns: { success: bool, message: str, upvote_count: int, already_upvoted?: bool }
    """
    db = get_firestore_client()
    if not db:
        raise Exception("Firestore client not available")

    try:
        if not issue_id or not user_id:
            return {"success": False, "message": "Missing issue_id or user_id"}

        # Check if user already upvoted (use unified `upvotes` collection)
        upvote_doc_id = f"{issue_id}__{user_id}"
        upvote_ref = db.collection("upvotes").document(upvote_doc_id)
        upvote_doc = upvote_ref.get()

        if upvote_doc.exists and bool(upvote_doc.to_dict().get("isActive", False)):
            return {
                "success": False,
                "message": "You have already upvoted this issue",
                "already_upvoted": True,
                "isActive": True,
                "hasUpvoted": True,
            }

        # Get issue from Elasticsearch (source of truth)
        es_client = get_elasticsearch_client()
        if not es_client:
            raise Exception("Elasticsearch client not available")

        try:
            es_resp = await es_client.get(index="issues", id=issue_id)
            if hasattr(es_resp, 'body'):
                issue_data = es_resp.body.get("_source", {})
            else:
                issue_data = es_resp.get("_source", {})
        except Exception as e:
            logger.error(f"Issue {issue_id} not found in ES: {e}")
            raise Exception(f"Issue {issue_id} not found")

        issue_status = issue_data.get("status", "open").lower()
        reporter_id = issue_data.get("reported_by")

        # Create or reactivate upvote record
        payload = {
            "issue_id": issue_id,
            "user_id": user_id,
            "isActive": True,
            "upvotedAt": firestore.SERVER_TIMESTAMP,
            "lastUpdated": firestore.SERVER_TIMESTAMP,
        }
        if upvote_doc.exists:
            # Reactivate existing record
            logger.info(f"Reactivating upvote doc {upvote_doc_id}")
            upvote_ref.update({
                "isActive": True,
                "lastUpdated": firestore.SERVER_TIMESTAMP,
            })
        else:
            logger.info(f"Creating new upvote doc {upvote_doc_id}")
            upvote_ref.set(payload)

        # Get issue reference in Firestore
        issue_ref = db.collection("issues").document(issue_id)

        # Increment appropriate counter in Firestore
        if issue_status == "closed":
            upvote_update = {"upvotes": {"closed": Increment(1)}}
            upvote_field = "closed"
        else:
            upvote_update = {"upvotes": {"open": Increment(1)}}
            upvote_field = "open"

        issue_ref.set(upvote_update, merge=True)

        # Also update Elasticsearch counter to keep ES and Firestore consistent
        try:
            await es_client.update(
                index="issues",
                id=issue_id,
                body={
                    "script": {
                        "source": (
                            "if (ctx._source.upvotes == null) {ctx._source.upvotes = [:];} "
                            f"if (ctx._source.upvotes['{upvote_field}'] == null) {{ctx._source.upvotes['{upvote_field}'] = 0;}} "
                            f"ctx._source.upvotes['{upvote_field}'] += params.delta;"
                        ),
                        "lang": "painless",
                        "params": {"delta": 1},
                    }
                },
                refresh="wait_for",
            )
        except Exception as es_update_err:
            logger.warning(f"Failed to update ES upvote counter for {issue_id}: {es_update_err}")

        # Get updated count
        updated_issue = issue_ref.get().to_dict() or {}
        upvotes_obj = updated_issue.get("upvotes", {})
        closed_upvotes = int(upvotes_obj.get("closed", 0))
        open_upvotes = int(upvotes_obj.get("open", 0))
        
        upvote_count = closed_upvotes if issue_status == "closed" else open_upvotes

        actions: Dict[str, Any] = {}

        # Special logic for closed issues: 5+ "is fixed" votes = mark as verified/done
        FIXED_VERIFICATION_THRESHOLD = 5
        if issue_status == "closed" and closed_upvotes >= FIXED_VERIFICATION_THRESHOLD:
            try:
                # Mark as verified/done in Firestore
                issue_ref.set({
                    "verification_status": "verified_by_community",
                    "verified_at": firestore.SERVER_TIMESTAMP,
                }, merge=True)
                actions["verified_as_fixed"] = True
                logger.info(f"Issue {issue_id} verified as fixed after {closed_upvotes} community votes")
            except Exception as fe:
                logger.warning(f"Failed to mark issue as verified in Firestore for {issue_id}: {fe}")
            # Mirror to ES
            try:
                from datetime import datetime
                now = datetime.utcnow().isoformat() + "Z"
                await es_client.update(
                    index="issues",
                    id=issue_id,
                    body={
                        "doc": {
                            "verification_status": "verified_by_community",
                            "verified_at": now,
                        }
                    },
                    refresh="wait_for",
                )
            except Exception as ee:
                logger.warning(f"Failed to mark issue as verified in ES for {issue_id}: {ee}")

        # Award karma to reporter for first upvote on OPEN issue (prevent self-voting)
        if issue_status == "open" and not upvote_doc.exists and reporter_id and reporter_id != "anonymous" and reporter_id != user_id:
            try:
                reporter_ref = db.collection("users").document(reporter_id)
                reporter_doc = reporter_ref.get()
                if reporter_doc.exists:
                    reporter_ref.update({"karma": Increment(5)})
                    logger.info(f"Awarded 5 karma to reporter {reporter_id} for upvote on {issue_id}")
                else:
                    logger.warning(f"Reporter {reporter_id} not found in Firestore")
            except Exception as e:
                logger.error(f"Failed to award karma to reporter {reporter_id}: {e}")

        logger.info(f"User {user_id} upvoted issue {issue_id} ({issue_status})")

        return {
            "success": True,
            "message": "Issue upvoted successfully",
            "upvote_count": upvote_count,
            "isActive": True,
            "hasUpvoted": True,
            "upvotes": {
                "open": open_upvotes,
                "closed": closed_upvotes,
            },
            **({"actions": actions} if actions else {}),
        }

    except Exception as e:
        logger.error(f"Error upvoting issue {issue_id}: {e}")
        raise


async def remove_upvote(issue_id: str, user_id: str) -> Dict[str, Any]:
    """
    Remove upvote from an issue (soft delete by setting isActive False).

    Contract:
    - Inputs: issue_id (str), user_id (str)
    - Side effects: updates doc in `upvotes/{issue_id}__{user_id}` isActive=False and decrements counter.
    - Returns: { success: bool, message: str, upvote_count: int }
    """
    db = get_firestore_client()
    if not db:
        raise Exception("Firestore client not available")

    try:
        if not issue_id or not user_id:
            return {"success": False, "message": "Missing issue_id or user_id"}

        # Check if user already upvoted
        upvote_ref = db.collection("upvotes").document(f"{issue_id}__{user_id}")
        upvote_doc = upvote_ref.get()

        if not upvote_doc.exists or not bool(upvote_doc.to_dict().get("isActive", False)):
            return {
                "success": False,
                "message": "You have not upvoted this issue",
                "isActive": False,
                "hasUpvoted": False,
            }

        # Get issue from Elasticsearch (source of truth)
        es_client = get_elasticsearch_client()
        if not es_client:
            raise Exception("Elasticsearch client not available")

        try:
            es_resp = await es_client.get(index="issues", id=issue_id)
            if hasattr(es_resp, 'body'):
                issue_data = es_resp.body.get("_source", {})
            else:
                issue_data = es_resp.get("_source", {})
        except Exception as e:
            logger.error(f"Issue {issue_id} not found in ES: {e}")
            raise Exception(f"Issue {issue_id} not found")

        issue_status = issue_data.get("status", "open").lower()

        # Soft delete upvote record
        upvote_ref.update({
            "isActive": False,
            "lastUpdated": firestore.SERVER_TIMESTAMP,
        })

        # Get issue reference in Firestore
        issue_ref = db.collection("issues").document(issue_id)

        # Decrement appropriate counter
        if issue_status == "closed":
            upvote_update = {"upvotes": {"closed": Increment(-1)}}
            upvote_field = "closed"
        else:
            upvote_update = {"upvotes": {"open": Increment(-1)}}
            upvote_field = "open"

        issue_ref.set(upvote_update, merge=True)

        # Also update Elasticsearch counter to keep ES and Firestore consistent
        try:
            await es_client.update(
                index="issues",
                id=issue_id,
                body={
                    "script": {
                        "source": (
                            "if (ctx._source.upvotes == null) {ctx._source.upvotes = [:];} "
                            f"if (ctx._source.upvotes['{upvote_field}'] == null) {{ctx._source.upvotes['{upvote_field}'] = 0;}} "
                            f"ctx._source.upvotes['{upvote_field}'] = Math.max(0, ctx._source.upvotes['{upvote_field}'] + params.delta);"
                        ),
                        "lang": "painless",
                        "params": {"delta": -1},
                    }
                },
                refresh="wait_for",
            )
        except Exception as es_update_err:
            logger.warning(f"Failed to update ES upvote counter for {issue_id}: {es_update_err}")

        # Get updated count
        updated_issue = issue_ref.get().to_dict() or {}
        upvotes_obj = updated_issue.get("upvotes", {})
        closed_upvotes = int(upvotes_obj.get("closed", 0))
        open_upvotes = int(upvotes_obj.get("open", 0))
        
        upvote_count = max(0, closed_upvotes if issue_status == "closed" else open_upvotes)

        logger.info(f"User {user_id} removed upvote from issue {issue_id}")

        return {
            "success": True,
            "message": "Upvote removed successfully",
            "upvote_count": upvote_count,
            "isActive": False,
            "hasUpvoted": False,
            "upvotes": {
                "open": max(0, open_upvotes),
                "closed": max(0, closed_upvotes),
            }
        }

    except Exception as e:
        logger.error(f"Error removing upvote from issue {issue_id}: {e}")
        raise


async def report_issue(issue_id: str, user_id: str, reason: Optional[str] = None) -> Dict[str, Any]:
    """
    Report an issue for review.

    For OPEN issues: Reports as spam. If 5+ reports, hide issue.
    For CLOSED issues: Reports as 'not fixed'. If 5+ reports, reopen issue and revert karma to fixer.

    Contract:
    - Uses collection `reports` with doc id `{issue_id}__{user_id}` and boolean isActive.
    - Idempotent: if already active, returns already-reported.
    """
    db = get_firestore_client()
    if not db:
        raise Exception("Firestore client not available")

    try:
        if not issue_id or not user_id:
            return {"success": False, "message": "Missing issue_id or user_id"}

        # Constants
        REPORT_THRESHOLD_OPEN_HIDE = 5
        REPORT_THRESHOLD_CLOSED_REOPEN = 5

        # Check if user already reported
        report_doc_id = f"{issue_id}__{user_id}"
        report_ref = db.collection("reports").document(report_doc_id)
        report_doc = report_ref.get()

        if report_doc.exists and bool(report_doc.to_dict().get("isActive", False)):
            return {
                "success": False,
                "message": "You have already reported this issue",
                "hasReported": True,
                "isActive": True,
            }

        # Get issue data from Elasticsearch (source of truth)
        es_client = get_elasticsearch_client()
        if not es_client:
            raise Exception("Elasticsearch client not available")
        
        try:
            es_resp = await es_client.get(index="issues", id=issue_id)
            if hasattr(es_resp, 'body'):
                issue_data = es_resp.body.get("_source", {})
            else:
                issue_data = es_resp.get("_source", {})
        except Exception as e:
            logger.error(f"Issue {issue_id} not found in ES: {e}")
            raise Exception(f"Issue {issue_id} not found")

        issue_status = issue_data.get("status", "open").lower()
        closed_by = issue_data.get("closed_by")
        reporter_id = issue_data.get("reported_by")

        # Normalize/auto-derive reason if not provided
        if not reason:
            reason = "not_fixed" if issue_status == "closed" else "spam"

        # Create permanent report record
        report_payload = {
            "issue_id": issue_id,
            "user_id": user_id,
            "reason": reason,
            "isActive": True,
            "reportedAt": firestore.SERVER_TIMESTAMP,
            "lastUpdated": firestore.SERVER_TIMESTAMP,
        }
        report_ref.set(report_payload)

        # Get issue reference in Firestore
        issue_ref = db.collection("issues").document(issue_id)

        # Increment report counters in Firestore
        report_field = "closed" if issue_status == "closed" else "open"
        issue_ref.set({
            "report_count": Increment(1),
            "reports": {report_field: Increment(1)}
        }, merge=True)

        # Also update ES counters to keep in sync
        try:
            await es_client.update(
                index="issues",
                id=issue_id,
                body={
                    "script": {
                        "source": (
                            "if (ctx._source.reports == null) {ctx._source.reports = [:];} "
                            f"if (ctx._source.reports['{report_field}'] == null) {{ctx._source.reports['{report_field}'] = 0;}} "
                            f"ctx._source.reports['{report_field}'] += params.delta; "
                            "if (ctx._source.report_count == null) {ctx._source.report_count = 0;} "
                            "ctx._source.report_count += params.delta;"
                        ),
                        "lang": "painless",
                        "params": {"delta": 1},
                    }
                },
                refresh="wait_for",
            )
        except Exception as es_update_err:
            logger.warning(f"Failed to update ES report counter for {issue_id}: {es_update_err}")

        # Fetch updated Firestore issue for threshold checks
        updated_issue = (issue_ref.get().to_dict() or {})
        reports_obj = updated_issue.get("reports", {})
        open_reports = int(reports_obj.get("open", 0))
        closed_reports = int(reports_obj.get("closed", 0))

        actions: Dict[str, Any] = {}

        # Threshold 1: Open issue gets hidden as spam
        if issue_status == "open" and open_reports >= REPORT_THRESHOLD_OPEN_HIDE:
            try:
                # Mark hidden in Firestore
                issue_ref.set({"hidden_for_review": True, "spam": True}, merge=True)
                actions["hidden_for_review"] = True
                actions["marked_as_spam"] = True
                logger.info(f"Issue {issue_id} marked as spam (hidden) after {open_reports} reports")
            except Exception as fe:
                logger.warning(f"Failed to set hidden_for_review in Firestore for {issue_id}: {fe}")
            # Mirror to ES
            try:
                await es_client.update(
                    index="issues",
                    id=issue_id,
                    body={"doc": {"hidden_for_review": True, "spam": True}},
                    refresh="wait_for",
                )
            except Exception as ee:
                logger.warning(f"Failed to set hidden_for_review in ES for {issue_id}: {ee}")

        # Threshold 2: Closed issue reported as not fixed -> reopen and revert karma
        if issue_status == "closed" and closed_reports >= REPORT_THRESHOLD_CLOSED_REOPEN:
            # Revert karma from fixer (closed_by)
            if closed_by and closed_by != "anonymous":
                try:
                    fixer_ref = db.collection("users").document(closed_by)
                    fixer_doc = fixer_ref.get()
                    if fixer_doc.exists:
                        # Revert the karma awarded for closing the issue
                        fixer_ref.update({
                            "karma": Increment(-20),  # Revert the +20 karma awarded for fixing
                            "stats.issues_resolved": Increment(-1),
                        })
                        logger.info(f"Reverted 20 karma from fixer {closed_by} for reopened issue {issue_id}")
                    else:
                        logger.warning(f"Fixer {closed_by} not found in Firestore")
                except Exception as e:
                    logger.error(f"Failed to revert karma from fixer {closed_by}: {e}")
            
            # Revert karma from reporter if they got closing bonus
            if reporter_id and reporter_id != "anonymous":
                try:
                    reporter_ref = db.collection("users").document(reporter_id)
                    reporter_doc = reporter_ref.get()
                    if reporter_doc.exists:
                        reporter_ref.update({
                            "karma": Increment(-20),  # Revert the closing bonus
                            "stats.issues_resolved": Increment(-1),
                        })
                        logger.info(f"Reverted 20 karma from reporter {reporter_id} for reopened issue {issue_id}")
                except Exception as e:
                    logger.error(f"Failed to revert karma from reporter {reporter_id}: {e}")

            try:
                # Reopen in Firestore
                issue_ref.set({
                    "status": "open",
                    "hidden_for_review": False,
                    "closed_by": None,
                    "closed_at": None,
                }, merge=True)
                actions["reopened"] = True
                logger.info(f"Issue {issue_id} reopened after {closed_reports} 'not fixed' reports")
            except Exception as fe:
                logger.warning(f"Failed to reopen issue in Firestore for {issue_id}: {fe}")
            # Reopen in ES
            try:
                await es_client.update(
                    index="issues",
                    id=issue_id,
                    body={
                        "doc": {
                            "status": "open",
                            "hidden_for_review": False,
                            "closed_by": None,
                            "closed_at": None,
                        }
                    },
                    refresh="wait_for",
                )
            except Exception as ee:
                logger.warning(f"Failed to reopen issue in ES for {issue_id}: {ee}")

        logger.info(f"User {user_id} reported issue {issue_id}: {reason}")

        return {
            "success": True,
            "message": "Issue reported successfully",
            "hasReported": True,
            "isActive": True,
            "reports": {
                "open": open_reports,
                "closed": closed_reports,
            },
            **({"actions": actions} if actions else {}),
        }

    except Exception as e:
        logger.error(f"Error reporting issue {issue_id}: {e}")
        raise


async def toggle_upvote(issue_id: str, user_id: str) -> Dict[str, Any]:
    """
    Toggle an upvote for a user on an issue.

    If currently active -> deactivate (remove_upvote). If inactive or missing -> activate (upvote_issue).

    Returns the same shape as upvote/remove with hasUpvoted/isActive reflecting the final state.
    """
    db = get_firestore_client()
    if not db:
        raise Exception("Firestore client not available")

    if not issue_id or not user_id:
        return {"success": False, "message": "Missing issue_id or user_id"}

    try:
        upvote_ref = db.collection("upvotes").document(f"{issue_id}__{user_id}")
        upvote_doc = upvote_ref.get()
        is_active = upvote_doc.exists and bool(upvote_doc.to_dict().get("isActive", False))

        if is_active:
            return await remove_upvote(issue_id, user_id)
        else:
            return await upvote_issue(issue_id, user_id)

    except Exception as e:
        logger.error(f"Error toggling upvote for issue {issue_id}: {e}")
        raise

