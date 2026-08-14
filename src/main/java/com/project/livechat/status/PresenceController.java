package com.project.livechat.status;


import com.project.livechat.entity.User;
import com.project.livechat.entity.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/api/presence")
@RequiredArgsConstructor
public class PresenceController {

    private final UserRepository userRepository;
    private final PresenceService presenceService;


    @GetMapping("/{publicId}")
    public PresenceResponseDTO getPresence(@PathVariable String publicId) {
        User user = userRepository.findByPublicId(publicId)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + publicId));

        return new PresenceResponseDTO(
                user.getPublicId(),
                presenceService.isOnline(user.getEmail()),
                presenceService.getLastSeen(user.getEmail())
        );
    }
}
