import abc
import json
import logging
import os
import base64
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime

import firebase_admin
from firebase_admin import credentials, firestore

logger = logging.getLogger(__name__)

class StorageBackend(abc.ABC):
    @abc.abstractmethod
    def save_session(self, session_id: str, data: Dict[str, Any]) -> None:
        pass

    @abc.abstractmethod
    def load_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        pass

    @abc.abstractmethod
    def list_sessions(self) -> List[Dict[str, Any]]:
        pass

    @abc.abstractmethod
    def delete_session(self, session_id: str) -> None:
        pass

class FileStorageBackend(StorageBackend):
    def __init__(self, data_dir: str = "data/sessions"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"📁 Initialized FileStorageBackend at {self.data_dir}")

    def _get_path(self, session_id: str) -> Path:
        return self.data_dir / f"{session_id}.json"

    def save_session(self, session_id: str, data: Dict[str, Any]) -> None:
        try:
            with open(self._get_path(session_id), 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Failed to save session {session_id} to file: {e}")

    def load_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        path = self._get_path(session_id)
        if not path.exists():
            return None
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load session {session_id} from file: {e}")
            return None

    def list_sessions(self) -> List[Dict[str, Any]]:
        sessions = []
        for file_path in self.data_dir.glob("session_*.json"):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    sessions.append(json.load(f))
            except Exception as e:
                logger.warning(f"Failed to read session file {file_path}: {e}")
        return sessions

    def delete_session(self, session_id: str) -> None:
        path = self._get_path(session_id)
        if path.exists():
            path.unlink()

class FirestoreStorageBackend(StorageBackend):
    def __init__(self, collection_name: str = "sessions"):
        self.collection_name = collection_name
        self._init_firebase()
        self.db = firestore.client()
        logger.info(f"🔥 Initialized FirestoreStorageBackend (Collection: {collection_name})")

    def _init_firebase(self):
        try:
            # Check if already initialized to avoid error
            if firebase_admin._apps:
                return

            # Try to init with env var (Base64 encoded JSON)
            service_account_b64 = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY")
            if service_account_b64:
                try:
                    # Decode base64
                    json_str = base64.b64decode(service_account_b64).decode('utf-8')
                    cred_dict = json.loads(json_str)
                    cred = credentials.Certificate(cred_dict)
                    firebase_admin.initialize_app(cred)
                    logger.info("Successfully initialized Firebase with SERVICE_ACCOUNT_KEY")
                except Exception as e:
                    logger.error(f"Failed to decode/parse FIREBASE_SERVICE_ACCOUNT_KEY: {e}")
                    # Fallback to default (might work on GCP context)
                    firebase_admin.initialize_app()
            else:
                # Try local file 'serviceAccountKey.json' or default
                cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
                if cred_path and os.path.exists(cred_path):
                     cred = credentials.Certificate(cred_path)
                     firebase_admin.initialize_app(cred)
                else:
                    # Last resort: Application Default Credentials
                    logger.warning("No specific Firebase credentials found, trying default.")
                    firebase_admin.initialize_app()
        except Exception as e:
             logger.error(f"Firebase initialization failed: {e}")
             raise

    def save_session(self, session_id: str, data: Dict[str, Any]) -> None:
        try:
            # Firestore doesn't like some data types (like nested lists sometimes?), but pure JSON dicts usually fine.
            # Convert datetime strings? JSON usually has them as strings already.
            self.db.collection(self.collection_name).document(session_id).set(data)
        except Exception as e:
            logger.error(f"Failed to save session {session_id} to Firestore: {e}")

    def load_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        try:
            doc = self.db.collection(self.collection_name).document(session_id).get()
            if doc.exists:
                return doc.to_dict()
            return None
        except Exception as e:
             logger.error(f"Failed to load session {session_id} from Firestore: {e}")
             return None

    def list_sessions(self) -> List[Dict[str, Any]]:
        try:
            docs = self.db.collection(self.collection_name).stream()
            return [doc.to_dict() for doc in docs]
        except Exception as e:
            logger.error(f"Failed to list sessions from Firestore: {e}")
            return []

    def delete_session(self, session_id: str) -> None:
        try:
             self.db.collection(self.collection_name).document(session_id).delete()
        except Exception as e:
            logger.error(f"Failed to delete session {session_id} from Firestore: {e}")
