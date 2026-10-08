/** Only the current conversation may apply a response, even if abort arrives too late. */
export class ConversationRequest {
  private active: AbortController | null = null;

  start(): AbortController {
    this.cancel();
    this.active = new AbortController();
    return this.active;
  }

  isCurrent(request: AbortController): boolean {
    return this.active === request && !request.signal.aborted;
  }

  cancel(): void {
    this.active?.abort();
    this.active = null;
  }
}
