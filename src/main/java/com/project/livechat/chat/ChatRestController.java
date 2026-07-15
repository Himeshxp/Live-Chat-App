package com.project.livechat.chat;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST endpoints for reading chat message history.
 * Used by the frontend to load messages when opening a conversation.
 */
@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
public class ChatRestController {

    private final ChatService chatService;

    /** Returns the 100 most recent messages across all conversations (legacy/debug). */
    @GetMapping("/messages")
    public List<ChatMessageResponseDTO> getMessages() {
        return chatService.getMessageHistory();
    }

    /** Returns all messages for a specific conversation, ordered oldest-first. */
    @GetMapping("/conversations/{conversationId}/messages")
    public List<ChatMessageResponseDTO> getMessagesForConversation(@PathVariable Integer conversationId) {
        return chatService.getMessagesForConversation(conversationId);
    }
}
