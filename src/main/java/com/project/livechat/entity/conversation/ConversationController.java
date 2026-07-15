package com.project.livechat.entity.conversation;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST endpoints for conversation management.
 * Creating a conversation also pushes a real-time notification to both participants
 * via WebSocket so their sidebars update instantly.
 */
@RestController
@RequestMapping("/api/conversations")
@RequiredArgsConstructor
public class ConversationController {

    private final ConversationService conversationService;
    private final SimpMessagingTemplate messagingTemplate;

    /**
     * Get-or-create a conversation between the current user and another user identified by publicId.
     * If the conversation already exists, the existing one is returned (idempotent).
     */
    @PostMapping
    public ConversationResponseDTO getOrCreateConversation(@RequestBody CreateConversationRequestDTO request) {
        ConversationResponseDTO conversation = conversationService.getOrCreateConversation(
                request.currentUser(), request.otherPublicId());

        // Notify both participants so their sidebar updates in real time
        messagingTemplate.convertAndSend("/topic/users/" + conversation.participant1PublicId() + "/conversations", conversation);
        messagingTemplate.convertAndSend("/topic/users/" + conversation.participant2PublicId() + "/conversations", conversation);

        return conversation;
    }

    /** Returns all conversations for a user, ordered newest-first. */
    @GetMapping
    public List<ConversationResponseDTO> getConversations(@RequestParam String currentUser) {
        return conversationService.getConversationsForUser(currentUser);
    }
}
