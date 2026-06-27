package com.project.livechat.config;

import com.project.livechat.chat.ChatMessage;
import com.project.livechat.chat.ChatMessageResponseDTO;
import com.project.livechat.chat.ChatService;
import com.project.livechat.chat.MessageType;
import com.project.livechat.entity.User;
import com.project.livechat.entity.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessageSendingOperations;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@RequiredArgsConstructor
@Component
@Slf4j
public class WebSocketEventListener {
    private final SimpMessageSendingOperations messagetemplate;
    private final ChatService chatService;
    private final UserRepository userRepository;



    @EventListener
    public void handleWebSocketDisConnectListener(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String username= (String) accessor.getSessionAttributes().get("username");
        if(username!=null){
            log.info("user disconnected from {}",username);
            User sender = userRepository.findByUsername(username).orElse(null);
            if(sender == null){
                sender = userRepository.findByEmail(username).orElse(null);
            }
            if(sender == null){
                return;
            }
            ChatMessage chatmessage= ChatMessage.builder()
                    .type(MessageType.LEAVE)
                    .sender(sender)
                    .build();
            ChatMessage saved = chatService.save(chatmessage);
            messagetemplate.convertAndSend("/topic/public",
                    new ChatMessageResponseDTO(username, saved.getContent(), saved.getType(), saved.getTimestamp()));
        }


    }
}
