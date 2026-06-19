package com.project.livechat.config;

import com.project.livechat.chat.ChatMessage;
import com.project.livechat.chat.MessageType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.logging.log4j.message.SimpleMessage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessageSendingOperations;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Component
@Slf4j
public class WebSocketEventListener {
    private final SimpMessageSendingOperations messagetemplate;

    public WebSocketEventListener(SimpMessageSendingOperations messagetemplate) {
        this.messagetemplate = messagetemplate;
    }

    @EventListener
    public void handleWebSocketConnectListener(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String username= (String) accessor.getSessionAttributes().get("username");
        if(username!=null){
            log.info("user disconnected from {}",username);
            var chatmessage= ChatMessage.builder()
                    .type(MessageType.LEAVE)
                    .sender(username)
                    .build();
            messagetemplate.convertAndSend("/topic/public",chatmessage);
        }
    }
}
