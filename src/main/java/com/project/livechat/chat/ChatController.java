package com.project.livechat.chat;

import com.project.livechat.entity.User;
import com.project.livechat.entity.UserRepository;
import com.project.livechat.entity.conversation.Conversation;
import com.project.livechat.entity.conversation.ConversationResponseDTO;
import com.project.livechat.entity.conversation.ConversationService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

@RequiredArgsConstructor
@Controller
public class ChatController {
    public final ChatService chatService;
    private final UserRepository userRepository;
    private final ConversationService conversationService;
    private final SimpMessagingTemplate messagingTemplate;


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

        messagingTemplate.convertAndSend(
                "/topic/chat/" + conversation.getId(),
                chatService.toResponse(saved)
        );
        ConversationResponseDTO conversationResponse = conversationService.toResponse(conversation);
        notifyParticipant(conversationResponse.participant1PublicId(), conversationResponse);
        notifyParticipant(conversationResponse.participant2PublicId(), conversationResponse);

    }

    @MessageMapping("/chat.addUser")
    public void addUser(
            @Payload ChatMessageRequestDTO message,
            SimpMessageHeaderAccessor headerAccessor
    ){
        String username = message.sender();
        headerAccessor.getSessionAttributes().put("username", username);
    }

    private User resolveUser(String username) {
        return userRepository.findByUsername(username)
                .or(() -> userRepository.findByEmail(username))
                .or(() -> userRepository.findByPublicId(username))
                .orElseThrow(() -> new IllegalArgumentException("Unknown user: " + username));
    }

    private void notifyParticipant(String publicId, ConversationResponseDTO conversation) {
        messagingTemplate.convertAndSend("/topic/users/" + publicId + "/conversations", conversation);
    }
}
