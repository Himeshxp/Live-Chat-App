package com.project.livechat.entity.conversation;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ConversationRepository extends JpaRepository<Conversation, Integer> {

    @EntityGraph(attributePaths = {"participant1", "participant2"})
    @Query("""
            select c from Conversation c
            where (c.participant1.id = :userA and c.participant2.id = :userB)
               or (c.participant1.id = :userB and c.participant2.id = :userA)
            """)
    Optional<Conversation> findBetweenUsers(@Param("userA") Integer userA, @Param("userB") Integer userB);

    @EntityGraph(attributePaths = {"participant1", "participant2"})
    Optional<Conversation> findWithParticipantsById(Integer id);

    @EntityGraph(attributePaths = {"participant1", "participant2"})
    @Query("""
            select c from Conversation c
            where c.participant1.id = :userId or c.participant2.id = :userId
            order by c.createdAt desc
            """)
    List<Conversation> findAllForUser(@Param("userId") Integer userId);
}
