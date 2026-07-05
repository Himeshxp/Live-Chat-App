package com.project.livechat.entity.conversation;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/conversations")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class ConversationController {
    private final ConversationService conversationService;
    private final SimpMessagingTemplate messagingTemplate;

    @PostMapping
    public ConversationResponseDTO getOrCreateConversation(@RequestBody CreateConversationRequestDTO request) {
        ConversationResponseDTO conversation = conversationService.getOrCreateConversation(request.currentUser(), request.otherPublicId());
        notifyParticipant(conversation.participant1PublicId(), conversation);
        notifyParticipant(conversation.participant2PublicId(), conversation);
        return conversation;
    }

    @GetMapping
    public List<ConversationResponseDTO> getConversations(@RequestParam String currentUser) {
        return conversationService.getConversationsForUser(currentUser);
    }

    private void notifyParticipant(String publicId, ConversationResponseDTO conversation) {
        messagingTemplate.convertAndSend("/topic/users/" + publicId + "/conversations", conversation);
    }
}
