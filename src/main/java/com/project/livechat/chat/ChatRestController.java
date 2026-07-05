package com.project.livechat.chat;


import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/chat")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class ChatRestController {
    private final ChatService chatService;

    @GetMapping("/messages")
    public List<ChatMessageResponseDTO> getMessages() {
        return chatService.getMessageHistory();
    }

    @GetMapping("/conversations/{conversationId}/messages")
    public List<ChatMessageResponseDTO> getMessagesForConversation(@PathVariable Integer conversationId) {
        return chatService.getMessagesForConversation(conversationId);
    }
}
