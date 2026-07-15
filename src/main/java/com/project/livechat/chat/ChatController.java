package com.project.livechat.chat;

import com.project.livechat.entity.User;
import com.project.livechat.entity.UserRepository;
import com.project.livechat.entity.conversation.Conversation;
import com.project.livechat.entity.conversation.ConversationResponseDTO;
import com.project.livechat.entity.conversation.ConversationService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

/**
 * STOMP WebSocket controller.
 * Handles /app/chat.sendMessage and /app/chat.addUser.
 * All messages are persisted via ChatService and broadcast to the relevant topic.
 */
@Controller
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;
    private final UserRepository userRepository;
    private final ConversationService conversationService;
    private final SimpMessagingTemplate messagingTemplate;

    /**
     * Receives a chat message from a client, persists it, then broadcasts it
     * to /topic/chat/{conversationId} so both participants receive it live.
     * Also pushes a conversation-update notification to each participant's
     * personal topic so the sidebar stays in sync.
     */
    @MessageMapping("/chat.sendMessage")
    public void sendMessage(@Payload ChatMessageRequestDTO message) {
        Conversation conversation = conversationService.getConversationForMessage(
                message.conversationId(),
                message.sender()
        );

        ChatMessage chatMessage = ChatMessage.builder()
                .sender(resolveUser(message.sender()))
                .content(message.content())
                .type(message.type() == null ? MessageType.CHAT : message.type())
                .conversation(conversation)
                .build();

        ChatMessage saved = chatService.saveChatMessage(chatMessage);

        // Broadcast message to the conversation topic
        messagingTemplate.convertAndSend(
                "/topic/chat/" + conversation.getId(),
                chatService.toResponse(saved)
        );

        // Notify both participants to refresh their sidebar conversation list
        ConversationResponseDTO convResponse = conversationService.toResponse(conversation);
        messagingTemplate.convertAndSend("/topic/users/" + convResponse.participant1PublicId() + "/conversations", convResponse);
        messagingTemplate.convertAndSend("/topic/users/" + convResponse.participant2PublicId() + "/conversations", convResponse);
    }

    /**
     * Called when a client connects and announces their username.
     * Stores the username in the WebSocket session for disconnect logging.
     */
    @MessageMapping("/chat.addUser")
    public void addUser(
            @Payload ChatMessageRequestDTO message,
            SimpMessageHeaderAccessor headerAccessor
    ) {
        headerAccessor.getSessionAttributes().put("username", message.sender());
    }

    /** Resolves a sender by username, email, or publicId — whichever is provided. */
    private User resolveUser(String value) {
        return userRepository.findByUsername(value)
                .or(() -> userRepository.findByEmail(value))
                .or(() -> userRepository.findByPublicId(value))
                .orElseThrow(() -> new IllegalArgumentException("Unknown user: " + value));
    }
}
