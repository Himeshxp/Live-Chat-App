package com.project.livechat.chat;

import com.project.livechat.entity.User;
import com.project.livechat.entity.UserRepository;
import com.project.livechat.entity.conversation.Conversation;
import com.project.livechat.entity.conversation.ConversationResponseDTO;
import com.project.livechat.entity.conversation.ConversationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;

/**
 * STOMP WebSocket controller.
 *
 * Fix 5: the sender is now derived from the authenticated Principal injected
 * by Spring (set by WebSocketAuthInterceptor during CONNECT), NOT from the
 * client-supplied "sender" field in the payload. This prevents a malicious
 * client from impersonating another user by spoofing the sender field.
 */
@Controller
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;
    private final UserRepository userRepository;
    private final ConversationService conversationService;
    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/chat.sendMessage")
    public void sendMessage(@Payload @Valid ChatMessageRequestDTO message, Principal principal) {
        // Use the server-verified principal email — never trust message.sender()
        if (principal == null) {
            throw new IllegalArgumentException("Authentication is required.");
        }
        String senderEmail = principal.getName();
        User sender = userRepository.findByEmail(senderEmail)
                .orElseThrow(() -> new IllegalStateException("Authenticated user not found: " + senderEmail));

        Conversation conversation = conversationService.getConversationForMessage(
                message.conversationId(),
                senderEmail   // validate participant by email (from token)
        );

        ChatMessage chatMessage = ChatMessage.builder()
                .sender(sender)
                .content(message.content())
                .type(message.type() == null ? MessageType.CHAT : message.type())
                .conversation(conversation)
                .build();

        ChatMessage saved = chatService.saveChatMessage(chatMessage);

        // Broadcast to the conversation topic
        messagingTemplate.convertAndSend(
                "/topic/chat/" + conversation.getId(),
                chatService.toResponse(saved)
        );

        // Notify both participants' sidebars
        ConversationResponseDTO convResponse = conversationService.toResponse(conversation);
        messagingTemplate.convertAndSend(
                "/topic/users/" + convResponse.participant1PublicId() + "/conversations", convResponse);
        messagingTemplate.convertAndSend(
                "/topic/users/" + convResponse.participant2PublicId() + "/conversations", convResponse);
    }

    @MessageMapping("/chat.addUser")
    public void addUser(@Payload ChatMessageRequestDTO message, SimpMessageHeaderAccessor headerAccessor,
                        Principal principal) {
        // Store the verified username in the session for disconnect logging
        if (principal == null) {
            throw new IllegalArgumentException("Authentication is required.");
        }
        String username = principal.getName();
        headerAccessor.getSessionAttributes().put("username", username);
    }
}
