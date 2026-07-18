package com.project.livechat.config;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * WebSocket / STOMP configuration.
 *
 * Fix 5: WebSocketAuthInterceptor is registered on the inbound channel so every
 * STOMP CONNECT frame is authenticated before it reaches the message broker.
 *
 * Fix 9 (partial): SockJS allowed origins are also locked to ALLOWED_ORIGINS
 * so the WebSocket handshake respects the same origin policy as the REST API.
 */
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketconfigurer implements WebSocketMessageBrokerConfigurer {

    private final WebSocketAuthInterceptor webSocketAuthInterceptor;

    // Same env var used by SecurityConfig — keeps origin policy consistent
    @Value("${allowed.origins:*}")
    private String allowedOriginsRaw;

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        String[] origins = allowedOriginsRaw.split(",");
        // Use allowedOriginPatterns for the wildcard case (same-origin single-JAR deploy)
        boolean isWildcard = origins.length == 1 && origins[0].trim().equals("*");
        if (isWildcard) {
            registry.addEndpoint("/ws").setAllowedOriginPatterns("*").withSockJS();
        } else {
            registry.addEndpoint("/ws").setAllowedOrigins(origins).withSockJS();
        }
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.setApplicationDestinationPrefixes("/app");
        registry.enableSimpleBroker("/topic");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        // Every inbound STOMP frame passes through this interceptor.
        // The CONNECT command is validated; all other commands pass through unchanged.
        registration.interceptors(webSocketAuthInterceptor);
    }
}
