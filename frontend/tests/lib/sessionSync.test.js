import { broadcastSessionEnded, subscribeToSessionEnd, SESSION_ENDED } from '../../lib/auth/sessionSync';
import { TOKEN_STORAGE_KEY } from '../../lib/auth/token';

// Minimal in-memory BroadcastChannel: delivers to every other instance.
class FakeBroadcastChannel {
  static instances = [];
  constructor(name) {
    this.name = name;
    this.listeners = [];
    FakeBroadcastChannel.instances.push(this);
  }
  addEventListener(_type, fn) {
    this.listeners.push(fn);
  }
  removeEventListener(_type, fn) {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }
  postMessage(data) {
    for (const other of FakeBroadcastChannel.instances) {
      if (other !== this && other.name === this.name) other.listeners.forEach((l) => l({ data }));
    }
  }
  close() {
    FakeBroadcastChannel.instances = FakeBroadcastChannel.instances.filter((c) => c !== this);
  }
}

describe('sessionSync', () => {
  beforeEach(() => {
    global.BroadcastChannel = FakeBroadcastChannel;
  });
  afterEach(() => {
    delete global.BroadcastChannel;
  });

  it('notifies subscribers when another tab ends the session', () => {
    const onEnd = jest.fn();
    const unsubscribe = subscribeToSessionEnd(onEnd);

    // Simulate a message from a different tab.
    new FakeBroadcastChannel('ste-auth').postMessage({ type: SESSION_ENDED, reason: 'disconnected', tabId: 'other-tab' });

    expect(onEnd).toHaveBeenCalledWith('disconnected');
    unsubscribe();
  });

  it("ignores this tab's own broadcasts", () => {
    const onEnd = jest.fn();
    const unsubscribe = subscribeToSessionEnd(onEnd);

    broadcastSessionEnded('token-cleared');

    expect(onEnd).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('falls back to the storage event when the token is removed in another tab', () => {
    delete global.BroadcastChannel;
    const onEnd = jest.fn();
    const unsubscribe = subscribeToSessionEnd(onEnd);

    window.dispatchEvent(new StorageEvent('storage', { key: TOKEN_STORAGE_KEY, oldValue: 'jwt', newValue: null }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme', oldValue: 'dark', newValue: null }));

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith('token-removed');
    unsubscribe();
  });

  it('stops notifying after unsubscribe', () => {
    const onEnd = jest.fn();
    subscribeToSessionEnd(onEnd)();

    window.dispatchEvent(new StorageEvent('storage', { key: TOKEN_STORAGE_KEY, oldValue: 'jwt', newValue: null }));

    expect(onEnd).not.toHaveBeenCalled();
  });
});
