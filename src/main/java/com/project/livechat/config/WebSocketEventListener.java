package com.project.livechat.config;

import com.project.livechat.chat.ChatMessage;
import com.project.livechat.chat.ChatService;
import com.project.livechat.chat.MessageType;
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



    @EventListener
    public void handleWebSocketDisConnectListener(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String username= (String) accessor.getSessionAttributes().get("username");
        if(username!=null){
            log.info("user disconnected from {}",username);
            ChatMessage chatmessage= ChatMessage.builder()
                    .type(MessageType.LEAVE)
                    .sender(username)
                    .build();
            messagetemplate.convertAndSend("/topic/public",chatmessage);
            chatService.save(chatmessage);
        }


    }
}
