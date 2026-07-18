package com.project.livechat.entity.conversation;

import com.project.livechat.entity.User;
import com.project.livechat.entity.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ConversationService {
    private final ConversationRepository conversationRepository;
    private final UserRepository userRepository;

    @Transactional
    public ConversationResponseDTO getOrCreateConversation(String currentUser, String otherPublicId) {
        User participant1 = resolveUser(currentUser);
        User participant2 = userRepository.findByPublicId(otherPublicId)
                .orElseThrow(() -> new EntityNotFoundException("User not found with publicId: " + otherPublicId));

        if (participant1.getId().equals(participant2.getId())) {
            throw new IllegalArgumentException("Cannot create a conversation with yourself.");
        }

        Conversation conversation = conversationRepository
                .findBetweenUsers(participant1.getId(), participant2.getId())
                .orElseGet(() -> conversationRepository.save(Conversation.builder()
                        .participant1(participant1)
                        .participant2(participant2)
                        .build()));

        return toResponse(conversation);
    }

    @Transactional(readOnly = true)
    public List<ConversationResponseDTO> getConversationsForUser(String currentUser) {
        User user = resolveUser(currentUser);
        return conversationRepository.findAllForUser(user.getId())
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public Conversation getConversationForMessage(Integer conversationId, String sender) {
        Conversation conversation = conversationRepository.findWithParticipantsById(conversationId)
                .orElseThrow(() -> new EntityNotFoundException("Conversation not found: " + conversationId));
        User user = resolveUser(sender);

        boolean participant = conversation.getParticipant1().getId().equals(user.getId())
                || conversation.getParticipant2().getId().equals(user.getId());
        if (!participant) {
            throw new IllegalArgumentException("User is not a participant in this conversation.");
        }
        return conversation;
    }

    public ConversationResponseDTO toResponse(Conversation conversation) {
        return new ConversationResponseDTO(
                conversation.getId(),
                conversation.getParticipant1().getUsername(),
                conversation.getParticipant1().getPublicId(),
                conversation.getParticipant1().getAvatarColor(),   // Fix 4
                conversation.getParticipant2().getUsername(),
                conversation.getParticipant2().getPublicId(),
                conversation.getParticipant2().getAvatarColor(),   // Fix 4
                conversation.getCreatedAt()
        );
    }

    private User resolveUser(String value) {
        return userRepository.findByUsername(value)
                .or(() -> userRepository.findByEmail(value))
                .or(() -> userRepository.findByPublicId(value))
                .orElseThrow(() -> new EntityNotFoundException("Unknown user: " + value));
    }
}
