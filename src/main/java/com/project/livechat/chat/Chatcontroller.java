package com.project.livechat.chat;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

import java.time.Instant;

@RequiredArgsConstructor
@Controller
public class Chatcontroller {
    public final ChatService chatService;

    @MessageMapping("/chat.sendMessage")
    @SendTo("/topic/public")
    public ChatMessage sendMessage(@Payload ChatMessage message) {
        return chatService.saveChatMessage(message);

    }

    @MessageMapping("/chat.addUser")
    @SendTo("/topic/public")
    public ChatMessage adduser(
            @Payload ChatMessage message,
            SimpMessageHeaderAccessor headerAccessor
    ){
        // Add username in web socket session
        headerAccessor.getSessionAttributes().put("username", message.getSender());
        message.setType(MessageType.JOIN);
        chatService.saveChatMessage(message);
        return message;
    }
}
