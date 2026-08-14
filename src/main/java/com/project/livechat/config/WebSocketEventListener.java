package com.project.livechat.config;

import com.project.livechat.entity.User;
import com.project.livechat.entity.UserRepository;
import com.project.livechat.status.PresenceEventDTO;
import com.project.livechat.status.PresenceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@RequiredArgsConstructor
@Component
@Slf4j
public class WebSocketEventListener {

    private final PresenceService presenceService;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;

    @EventListener
    public void handleWebSocketConnectListener(SessionConnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());

        if (!(accessor.getUser() instanceof Authentication authentication)) {
            return;
        }

        String email = authentication.getName();
        String sessionId = accessor.getSessionId();

        boolean changedToOnline = presenceService.markOnline(email, sessionId);

        if (changedToOnline) {
            publishPresence(email, true);
        }

        log.info("User connected: {}", email);
    }

    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());

        if (!(accessor.getUser() instanceof Authentication authentication)) {
            return;
        }

        String email = authentication.getName();
        String sessionId = accessor.getSessionId();

        boolean changedToOffline = presenceService.markOffline(email, sessionId);

        if (changedToOffline) {
            publishPresence(email, false);
        }

        log.info("User disconnected: {}", email);
    }

    private void publishPresence(String email, boolean online) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalStateException("User not found: " + email));

        PresenceEventDTO event = new PresenceEventDTO(
                user.getPublicId(),
                online,
                presenceService.getLastSeen(email)
        );

        messagingTemplate.convertAndSend("/topic/presence", event);
    }
}