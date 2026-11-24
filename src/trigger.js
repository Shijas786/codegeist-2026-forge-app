import { handleComment, guardIssue } from './service.js';

export async function onComment(event) {
  const issueKey = event.issue?.key;
  const commentId = event.comment?.id;
  if (!issueKey || !commentId) return;
  const result = await handleComment({ issueKey, commentId: String(commentId) });
  if (!result.skipped) console.log(`comment ${issueKey}/${commentId}`, JSON.stringify(result));
}

export async function onIssueChange(event) {
  const issueKey = event.issue?.key;
  if (!issueKey) return;
  const result = await guardIssue(issueKey);
  if (!result.skipped) console.log(`guard ${issueKey}`, JSON.stringify(result));
}
