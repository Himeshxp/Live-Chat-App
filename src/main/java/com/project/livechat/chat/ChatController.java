package com.project.livechat.chat;

import com.project.livechat.entity.User;
import com.project.livechat.entity.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

@RequiredArgsConstructor
@Controller
public class ChatController {
    public final ChatService chatService;
    private final UserRepository userRepository;


    @MessageMapping("/chat.sendMessage")
    @SendTo("/topic/public")
    public ChatMessageResponseDTO sendMessage(@Payload ChatMessageRequestDTO message) {
        ChatMessage chatMessage = ChatMessage.builder()
                .sender(resolveUser(message.senderName()))
                .content(message.content())
                .type(message.type() == null ? MessageType.CHAT : message.type())
                .build();
        ChatMessage saved = chatService.save(chatMessage);

        return new ChatMessageResponseDTO(
                saved.getSender().getUsername(),
                saved.getContent(),
                saved.getType(),
                saved.getTimestamp()
        );

    }

    @MessageMapping("/chat.addUser")
    @SendTo("/topic/public")
    public ChatMessageResponseDTO addUser(
            @Payload ChatMessageRequestDTO message,
            SimpMessageHeaderAccessor headerAccessor
    ){
        String username = message.senderName();
        headerAccessor.getSessionAttributes().put("username", username);

        ChatMessage chatMessage = ChatMessage.builder()
                .sender(resolveUser(username))
                .type(MessageType.JOIN)
                .build();
        ChatMessage saved = chatService.save(chatMessage);
        return new ChatMessageResponseDTO(
                saved.getSender().getUsername(),
                saved.getContent(),
                saved.getType(),
                saved.getTimestamp()
        );

    }

    private User resolveUser(String username) {
        return userRepository.findByUsername(username)
                .or(() -> userRepository.findByEmail(username))
                .orElseThrow(() -> new IllegalArgumentException("Unknown user: " + username));
    }

}
