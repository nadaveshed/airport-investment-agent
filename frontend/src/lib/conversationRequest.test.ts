import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConversationRequest } from './conversationRequest';

test('reset rejects late session, text and completion events from the old request', () => {
  const conversation = new ConversationRequest();
  const oldRequest = conversation.start();
  assert.equal(conversation.isCurrent(oldRequest), true);
  conversation.cancel();
  assert.equal(oldRequest.signal.aborted, true);
  assert.equal(conversation.isCurrent(oldRequest), false);
});

test('a stale completion cannot change a new conversation or clear its busy state', () => {
  const conversation = new ConversationRequest();
  const oldRequest = conversation.start();
  conversation.cancel();
  const newRequest = conversation.start();
  assert.equal(conversation.isCurrent(oldRequest), false);
  assert.equal(conversation.isCurrent(newRequest), true);
  assert.equal(newRequest.signal.aborted, false);
});

test('sending a question supersedes a pending history restore', () => {
  const conversation = new ConversationRequest();
  const restore = conversation.start();
  const question = conversation.start();
  assert.equal(restore.signal.aborted, true);
  assert.equal(conversation.isCurrent(restore), false);
  assert.equal(conversation.isCurrent(question), true);
});
