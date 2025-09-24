from collections import deque
from typing import List

from .matching_task import MatchingTask


class SessionManager:
    """Session Manager class
    This class is responsible for managing the session of the user.

    Each session have:
    - A unique name
    - A MatchingTask object
    """

    def __init__(self):
        self.max_sessions = 5  # Reduced from 10 to save memory
        self.queue = deque(maxlen=self.max_sessions)  # Set maxlen to avoid growing
        self.sessions = {"default": Session("default")}
        self.queue.append("default")

    def add_session(self, session_name: str) -> None:
        if session_name in self.sessions:
            # Move the session to the end of the queue
            self.queue.remove(session_name)
            self.queue.append(session_name)
        else:
            if len(self.sessions) >= self.max_sessions:
                # Remove the least recently used session
                lru_session = self.queue.popleft()
                del self.sessions[lru_session]
            # Add the new session
            self.sessions[session_name] = Session(session_name)
            self.queue.append(session_name)

    # Convenience alias to match API naming
    def create_session(self, session_name: str) -> None:
        self.add_session(session_name)

    def get_session(self, session_name: str) -> "Session":
        if session_name not in self.sessions:
            # Return default session if requested session doesn't exist
            return self.sessions.get("default")
        # Move accessed session to end of queue (most recently used)
        if session_name in self.queue:
            self.queue.remove(session_name)
            self.queue.append(session_name)
        return self.sessions.get(session_name)

    def remove_session(self, session_name: str) -> None:
        if session_name in self.sessions and session_name != "default":
            del self.sessions[session_name]
            if session_name in self.queue:
                self.queue.remove(session_name)

    # Convenience alias to match API naming
    def delete_session(self, session_name: str) -> None:
        self.remove_session(session_name)

    def get_active_sessions(self) -> List[str]:
        return list(self.sessions.keys())

    # Convenience alias to match API naming
    def list_sessions(self) -> List[str]:
        return self.get_active_sessions()

    def get_session_count(self) -> int:
        return len(self.sessions)


class Session:
    def __init__(self, name: str):
        self.name = name
        self.matching_task = None  # Lazy initialization
        self._initialized = False

    @property
    def matching_task(self):
        if not self._initialized:
            self._matching_task = MatchingTask(session_name=self.name)
            self._initialized = True
        return self._matching_task

    @matching_task.setter
    def matching_task(self, value):
        self._matching_task = value
        self._initialized = value is not None


SESSION_MANAGER = SessionManager()
