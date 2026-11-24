import { handleComment } from './service.js';

export async function onComment(event) {
  const issueKey = event.issue?.key;
  const commentId = event.comment?.id;
  if (!issueKey || !commentId) return;
  const result = await handleComment({ issueKey, commentId: String(commentId) });
  if (!result.skipped) console.log(`comment ${issueKey}/${commentId}`, JSON.stringify(result));
}
