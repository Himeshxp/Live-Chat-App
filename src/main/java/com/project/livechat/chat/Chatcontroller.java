package com.project.livechat.chat;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

@Controller
public class Chatcontroller {

    @Autowired
    private ChatService chatService;
    @MessageMapping("/chat.sendMessage")
    @SendTo("/topic/public")
    public ChatMessage sendMessage(@Payload ChatMessage message) {
        chatService.saveChatMessage(message);
        return message;
    }

    @MessageMapping("/chat.addUser")
    @SendTo("/topic/public")
    public ChatMessage adduser(
            @Payload ChatMessage message,
            SimpMessageHeaderAccessor headerAccessor
    ){
        // Add username in web socket session
        headerAccessor.getSessionAttributes().put("username", message.getSender());
        chatService.saveChatMessage(message);
        return message;
    }
}
