# Community Module

## Endpoints
- `GET /community/feed` — list feed posts with pagination.
- `POST /community/feed` — create a new post (auth required).
- `GET /community/posts/:postId/comments` — list comments for a post.
- `POST /community/posts/:postId/comments` — add a comment.
- `POST /community/posts/:postId/reactions` — add/update a reaction.
- `DELETE /community/reactions/:reactionId` — remove a reaction.

## Content Limits
- Feed post bodies capped at 2000 characters; longer payloads return HTTP 422.
- Posts accept up to 5 tags, each 32 characters or fewer, to bound payload sizes during perf tests.
- Comment bodies share the 2000 character ceiling to keep moderation queues performant.
- Feed and comment pagination allow at most 50 records per request to prevent runaway page sizes during perf runs.
