"""
Centralized Firestore service for consistent database operations.
Provides reusable utilities for user, issue, and interaction management.
"""

import logging
from typing import Dict, Optional, Any
from google.cloud.firestore_v1.transforms import Increment
from firebase_admin import firestore as fb_firestore
from core.database import get_firestore_client

logger = logging.getLogger(__name__)


class FirestoreService:
    """Centralized Firestore operations service"""
    
    def __init__(self):
        self.db = get_firestore_client()
        if not self.db:
            logger.error("Firestore client not available")
    
    # ==================== User Operations ====================
    
    async def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get user document by ID.
        
        Args:
            user_id: Firebase user ID
            
        Returns:
            User data dictionary or None if not found
        """
        if not self.db:
            return None
            
        try:
            user_ref = self.db.collection("users").document(user_id)
            user_doc = user_ref.get()
            
            if user_doc.exists:
                return user_doc.to_dict()
            return None
        except Exception as e:
            logger.error(f"Error getting user {user_id}: {e}")
            return None
    
    async def create_or_update_user(
        self, 
        user_id: str, 
        data: Dict[str, Any],
        merge: bool = True
    ) -> bool:
        """
        Create or update user document using merge.
        Safe for both new and existing users.
        
        Args:
            user_id: Firebase user ID
            data: User data to set/update
            merge: Whether to merge with existing data (default True)
            
        Returns:
            True if successful, False otherwise
        """
        if not self.db:
            return False
            
        try:
            user_ref = self.db.collection("users").document(user_id)
            user_ref.set(data, merge=merge)
            logger.info(f"User {user_id} created/updated successfully")
            return True
        except Exception as e:
            logger.error(f"Error creating/updating user {user_id}: {e}")
            return False
    
    async def initialize_user(
        self,
        user_id: str,
        name: str,
        email: str,
        user_type: str = "citizen"
    ) -> bool:
        """
        Initialize a new user with default values.
        Safe to call even if user already exists (uses merge).
        
        Args:
            user_id: Firebase user ID
            name: User's display name
            email: User's email
            user_type: User type ('citizen' or 'ngo')
            
        Returns:
            True if successful, False otherwise
        """
        default_data = {
            "name": name,
            "email": email,
            "userType": user_type,
            "createdAt": fb_firestore.SERVER_TIMESTAMP,
            "karma": 0,
            "has_posted_before": False,
            "lastLocation": None,
            "stats": {
                "issues_reported": 0,
                "issues_resolved": 0,
                "co2_saved": 0.0
            }
        }
        
        return await self.create_or_update_user(user_id, default_data, merge=True)
    
    async def update_user_location(
        self,
        user_id: str,
        latitude: float,
        longitude: float,
        address: str
    ) -> bool:
        """
        Update user's last location.
        
        Args:
            user_id: Firebase user ID
            latitude: Location latitude
            longitude: Location longitude
            address: Human-readable address
            
        Returns:
            True if successful, False otherwise
        """
        location_data = {
            "lastLocation": {
                "coords": {
                    "latitude": latitude,
                    "longitude": longitude
                },
                "address": address
            },
            "lastLocationUpdated": fb_firestore.SERVER_TIMESTAMP
        }
        
        return await self.create_or_update_user(user_id, location_data, merge=True)
    
    async def increment_user_karma(self, user_id: str, amount: int) -> bool:
        """
        Increment user's karma by specified amount.
        
        Args:
            user_id: Firebase user ID
            amount: Karma amount to add (can be negative)
            
        Returns:
            True if successful, False otherwise
        """
        if not self.db:
            return False
            
        try:
            user_ref = self.db.collection("users").document(user_id)
            user_ref.set({
                "karma": Increment(amount)
            }, merge=True)
            logger.info(f"Incremented karma for user {user_id} by {amount}")
            return True
        except Exception as e:
            logger.error(f"Error incrementing karma for {user_id}: {e}")
            return False
    
    async def increment_user_stats(
        self,
        user_id: str,
        issues_reported: int = 0,
        issues_resolved: int = 0,
        co2_saved: float = 0.0,
        karma: int = 0
    ) -> bool:
        """
        Increment user's statistics.
        
        Args:
            user_id: Firebase user ID
            issues_reported: Number to add to issues_reported
            issues_resolved: Number to add to issues_resolved
            co2_saved: CO2 amount to add (kg)
            karma: Karma amount to add
            
        Returns:
            True if successful, False otherwise
        """
        if not self.db:
            return False
            
        try:
            user_ref = self.db.collection("users").document(user_id)
            updates = {}
            
            if issues_reported != 0:
                updates["stats.issues_reported"] = Increment(issues_reported)
            if issues_resolved != 0:
                updates["stats.issues_resolved"] = Increment(issues_resolved)
            if co2_saved != 0.0:
                updates["stats.co2_saved"] = Increment(co2_saved)
            if karma != 0:
                updates["karma"] = Increment(karma)
            
            if updates:
                user_ref.set(updates, merge=True)
                logger.info(f"Updated stats for user {user_id}")
                return True
            return True
        except Exception as e:
            logger.error(f"Error updating stats for {user_id}: {e}")
            return False
    
    async def award_first_post_karma(
        self,
        user_id: str,
        user_name: str,
        user_email: str
    ) -> bool:
        """
        Award first post karma and update stats.
        Creates user if doesn't exist.
        
        Args:
            user_id: Firebase user ID
            user_name: User's display name
            user_email: User's email
            
        Returns:
            True if successful, False otherwise
        """
        if not self.db:
            return False
            
        try:
            user_ref = self.db.collection("users").document(user_id)
            user_doc = user_ref.get()
            
            if user_doc.exists:
                user_data = user_doc.to_dict()
                has_posted = user_data.get("has_posted_before", False)
                
                if not has_posted:
                    # First post - award bonus karma
                    user_ref.set({
                        "karma": Increment(10),
                        "has_posted_before": True,
                        "stats.issues_reported": Increment(1)
                    }, merge=True)
                    logger.info(f"Awarded +10 first post karma to user {user_id}")
                else:
                    # Not first post - just increment stats
                    user_ref.set({
                        "stats.issues_reported": Increment(1)
                    }, merge=True)
                    logger.info(f"Incremented issues_reported for user {user_id}")
            else:
                # User doesn't exist - create with first post bonus
                user_ref.set({
                    "name": user_name,
                    "email": user_email,
                    "userType": "citizen",
                    "karma": 10,
                    "has_posted_before": True,
                    "createdAt": fb_firestore.SERVER_TIMESTAMP,
                    "stats": {
                        "issues_reported": 1,
                        "issues_resolved": 0,
                        "co2_saved": 0.0
                    }
                }, merge=True)
                logger.info(f"Created user and awarded +10 first post karma to {user_id}")
            
            return True
        except Exception as e:
            logger.error(f"Error awarding first post karma to {user_id}: {e}")
            return False
    
    # ==================== Issue Operations ====================
    
    async def increment_issue_reports(
        self,
        issue_id: str,
        report_field: str  # "open" or "closed"
    ) -> bool:
        """
        Increment issue report counts.
        
        Args:
            issue_id: Issue document ID
            report_field: Either "open" (spam) or "closed" (not_fixed)
            
        Returns:
            True if successful, False otherwise
        """
        if not self.db:
            return False
            
        try:
            issue_ref = self.db.collection("issues").document(issue_id)
            issue_ref.set({
                "report_count": Increment(1),
                f"reports.{report_field}": Increment(1)
            }, merge=True)
            logger.info(f"Incremented {report_field} reports for issue {issue_id}")
            return True
        except Exception as e:
            logger.error(f"Error incrementing reports for issue {issue_id}: {e}")
            return False
    
    async def get_issue_metadata(self, issue_id: str) -> Optional[Dict[str, Any]]:
        """
        Get issue metadata from Firestore.
        
        Args:
            issue_id: Issue document ID
            
        Returns:
            Issue metadata or None
        """
        if not self.db:
            return None
            
        try:
            issue_ref = self.db.collection("issues").document(issue_id)
            issue_doc = issue_ref.get()
            
            if issue_doc.exists:
                return issue_doc.to_dict()
            return None
        except Exception as e:
            logger.error(f"Error getting issue metadata {issue_id}: {e}")
            return None
    
    # ==================== Interaction Operations ====================
    
    async def get_upvote(self, issue_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get upvote record for a user and issue.
        
        Args:
            issue_id: Issue ID
            user_id: User ID
            
        Returns:
            Upvote data or None
        """
        if not self.db:
            return None
            
        try:
            upvote_id = f"{issue_id}__{user_id}"
            upvote_ref = self.db.collection("upvotes").document(upvote_id)
            upvote_doc = upvote_ref.get()
            
            if upvote_doc.exists:
                return upvote_doc.to_dict()
            return None
        except Exception as e:
            logger.error(f"Error getting upvote for {issue_id}/{user_id}: {e}")
            return None
    
    async def get_report(self, issue_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get report record for a user and issue.
        
        Args:
            issue_id: Issue ID
            user_id: User ID
            
        Returns:
            Report data or None
        """
        if not self.db:
            return None
            
        try:
            report_id = f"{issue_id}__{user_id}"
            report_ref = self.db.collection("reports").document(report_id)
            report_doc = report_ref.get()
            
            if report_doc.exists:
                return report_doc.to_dict()
            return None
        except Exception as e:
            logger.error(f"Error getting report for {issue_id}/{user_id}: {e}")
            return None
    
    # ==================== Leaderboard Operations ====================
    
    async def get_top_users_by_karma(self, limit: int = 100) -> list:
        """
        Get top users sorted by karma.
        
        Args:
            limit: Maximum number of users to return
            
        Returns:
            List of user data dictionaries
        """
        if not self.db:
            return []
            
        try:
            users_ref = self.db.collection("users")
            query = users_ref.order_by("karma", direction=fb_firestore.Query.DESCENDING).limit(limit)
            docs = query.stream()
            
            users = []
            for doc in docs:
                user_data = doc.to_dict()
                user_data["user_id"] = doc.id
                users.append(user_data)
            
            return users
        except Exception as e:
            logger.error(f"Error getting top users: {e}")
            return []


# Global instance
_firestore_service = None


def get_firestore_service() -> FirestoreService:
    """Get the global Firestore service instance"""
    global _firestore_service
    if _firestore_service is None:
        _firestore_service = FirestoreService()
    return _firestore_service

