package com.project.livechat.entity.conversation;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;

/**
 * REST endpoints for conversation management.
 *
 * Bug 5 fix: currentUser is now derived from the JWT Principal injected by
 * Spring Security, not from the request body. This prevents a logged-in user
 * from passing a different username and creating conversations on their behalf.
 */
@RestController
@RequestMapping("/api/conversations")
@RequiredArgsConstructor
public class ConversationController {

    private final ConversationService conversationService;
    private final SimpMessagingTemplate messagingTemplate;

    @PostMapping
    public ConversationResponseDTO getOrCreateConversation(
            @RequestBody @Valid CreateConversationRequestDTO request,
            Principal principal   // identity comes from the JWT, not the payload
    ) {
        // Use the authenticated email from the token to look up the real user
        ConversationResponseDTO conversation = conversationService.getOrCreateConversation(
                principal.getName(),          // verified email from JWT
                request.otherPublicId()
        );

        messagingTemplate.convertAndSend("/topic/users/" + conversation.participant1PublicId() + "/conversations", conversation);
        messagingTemplate.convertAndSend("/topic/users/" + conversation.participant2PublicId() + "/conversations", conversation);

        return conversation;
    }

    @GetMapping
    public List<ConversationResponseDTO> getConversations(Principal principal) {
        // Also derive currentUser from Principal here for the same reason
        return conversationService.getConversationsForUser(principal.getName());
    }
}
