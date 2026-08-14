package com.project.livechat.config;

import com.project.livechat.entity.User;
import com.project.livechat.entity.UserRepository;
import com.project.livechat.entity.conversation.ConversationService;
import com.project.livechat.security.JwtService;
import com.project.livechat.security.TokenBlocklist;
import com.project.livechat.security.UserDetailsServiceImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.security.core.Authentication;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

/**
 * Fix 5 — WebSocket JWT authentication.
 *
 * Intercepts every STOMP CONNECT frame and validates the JWT sent in the
 * "Authorization" header (value: "Bearer <token>"). If valid, a Spring
 * Security Authentication is attached to the WebSocket session so that
 * downstream handlers can call accessor.getUser() to get the real principal.
 *
 * Any CONNECT with a missing, revoked, or invalid token is rejected with
 * an IllegalArgumentException, which STOMP translates to an ERROR frame
 * and closes the connection — the client never reaches the message broker.
 */
@Component
@RequiredArgsConstructor
public class WebSocketAuthInterceptor implements ChannelInterceptor {

    private final JwtService jwtService;
    private final UserDetailsServiceImpl userDetailsService;
    private final TokenBlocklist tokenBlocklist;
    private final ConversationService conversationService;
    private final UserRepository userRepository;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            authenticateConnect(accessor);
        } else if (accessor != null && StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            authorizeSubscription(accessor);
        }

        return message;
    }

    private void authenticateConnect(StompHeaderAccessor accessor) {
        String authHeader = accessor.getFirstNativeHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new IllegalArgumentException("WebSocket connection rejected: missing JWT.");
        }

        String token = authHeader.substring(7);

        if (tokenBlocklist.isRevoked(token)) {
            throw new IllegalArgumentException("WebSocket connection rejected: token has been revoked.");
        }

        try {
            String email = jwtService.extractEmail(token);
            UserDetails userDetails = userDetailsService.loadUserByUsername(email);

            if (!jwtService.isTokenValid(token, userDetails)) {
                throw new IllegalArgumentException("WebSocket connection rejected: invalid or expired token.");
            }

            UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
            accessor.setUser(auth);

        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("WebSocket connection rejected: token validation failed.");
        }
    }

    private void authorizeSubscription(StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        if (destination == null) {
            throw new IllegalArgumentException("Subscription rejected: destination is required.");
        }

        if (!(accessor.getUser() instanceof Authentication authentication)) {
            throw new IllegalArgumentException("Subscription rejected: authentication is required.");
        }

        String email = authentication.getName();
        if (destination.equals("/topic/presence")) {
            return;
        }

        if (destination.startsWith("/topic/chat/")) {
            Integer conversationId = parseTrailingId(destination, "/topic/chat/");
            conversationService.getConversationForMessage(conversationId, email);
            return;
        }

        if (destination.startsWith("/topic/users/") && destination.endsWith("/conversations")) {
            String publicId = destination.substring("/topic/users/".length(),
                    destination.length() - "/conversations".length());
            User user = userRepository.findByEmail(email)
                    .orElseThrow(() -> new IllegalArgumentException("Subscription rejected: unknown user."));
            if (publicId.equals(user.getPublicId())) {
                return;
            }
        }

        throw new IllegalArgumentException("Subscription rejected: unauthorized destination.");
    }

    private Integer parseTrailingId(String destination, String prefix) {
        try {
            return Integer.valueOf(destination.substring(prefix.length()));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Subscription rejected: invalid conversation.");
        }
    }
}
