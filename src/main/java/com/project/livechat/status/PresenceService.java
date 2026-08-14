package com.project.livechat.status;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class PresenceService {
    private final ConcurrentHashMap<String, Set<String>> sessionsByEmail = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Instant> lastSeenByEmail = new ConcurrentHashMap<>();


    // wasOffline method checks if user was offline
    // so that it can create a new sessiosn and mark as Online
    public boolean markOnline(String email , String sessionid) {
        Set<String> sessions = sessionsByEmail.computeIfAbsent(email, key -> ConcurrentHashMap.newKeySet());

        boolean wasOffline= sessions.isEmpty();
        sessions.add(sessionid);

        return wasOffline;
    }

    public boolean markOffline(String email , String sessionid) {
        Set<String> sessions = sessionsByEmail.get(email);
        if (sessions == null) {
            lastSeenByEmail.put(email, Instant.now());
            return false;
        }
        sessions.remove(sessionid);
        if (sessions.isEmpty()) {
            sessionsByEmail.remove(email);
            lastSeenByEmail.put(email, Instant.now());
            return true;
        }

        return false;
    }
    public boolean isOnline(String email) {
        Set<String> sessions = sessionsByEmail.get(email);
        return sessions != null && !sessions.isEmpty();
    }
    public Instant getLastSeen(String email) {
        return lastSeenByEmail.get(email);
    }

}
