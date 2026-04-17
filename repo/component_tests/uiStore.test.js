/**
 * uiStore — Unit Tests
 *
 * Tests the Pinia UI store (toast queue) in isolation.
 * Each test creates a fresh Pinia instance so stores do not bleed between tests.
 */

import { setActivePinia, createPinia } from 'pinia';
import { useUiStore } from '../src/app/store/uiStore.js';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('uiStore — toast queue', () => {
  it('starts with an empty toast list', () => {
    const ui = useUiStore();
    expect(ui.toasts).toEqual([]);
  });

  it('addToast appends a toast with the correct fields', () => {
    const ui = useUiStore();
    ui.addToast('Hello', 'success', 0);
    expect(ui.toasts).toHaveLength(1);
    expect(ui.toasts[0].message).toBe('Hello');
    expect(ui.toasts[0].type).toBe('success');
    expect(typeof ui.toasts[0].id).toBe('number');
  });

  it('addToast assigns incrementing ids', () => {
    const ui = useUiStore();
    ui.addToast('A', 'info', 0);
    ui.addToast('B', 'info', 0);
    expect(ui.toasts[1].id).toBeGreaterThan(ui.toasts[0].id);
  });

  it('removeToast removes only the matching toast', () => {
    const ui = useUiStore();
    ui.addToast('First', 'info', 0);
    ui.addToast('Second', 'info', 0);
    const id = ui.toasts[0].id;
    ui.removeToast(id);
    expect(ui.toasts).toHaveLength(1);
    expect(ui.toasts[0].message).toBe('Second');
  });

  it('success() adds a toast with type "success"', () => {
    const ui = useUiStore();
    ui.success('Saved');
    expect(ui.toasts[0].type).toBe('success');
    expect(ui.toasts[0].message).toBe('Saved');
  });

  it('showError() adds a toast with type "error"', () => {
    const ui = useUiStore();
    ui.showError('Oops');
    expect(ui.toasts[0].type).toBe('error');
  });

  it('warning() adds a toast with type "warning"', () => {
    const ui = useUiStore();
    ui.warning('Watch out');
    expect(ui.toasts[0].type).toBe('warning');
  });

  it('info() adds a toast with type "info"', () => {
    const ui = useUiStore();
    ui.info('Note');
    expect(ui.toasts[0].type).toBe('info');
  });

  it('toast is auto-removed after its duration elapses', () => {
    const ui = useUiStore();
    ui.addToast('Temporary', 'info', 3000);
    expect(ui.toasts).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(ui.toasts).toHaveLength(0);
  });

  it('toast with duration 0 is NOT auto-removed', () => {
    const ui = useUiStore();
    ui.addToast('Persistent', 'info', 0);
    vi.advanceTimersByTime(10_000);
    expect(ui.toasts).toHaveLength(1);
  });

  it('multiple toasts auto-remove independently', () => {
    const ui = useUiStore();
    ui.addToast('Short', 'info', 1000);
    ui.addToast('Long', 'info', 5000);
    vi.advanceTimersByTime(1000);
    expect(ui.toasts).toHaveLength(1);
    expect(ui.toasts[0].message).toBe('Long');
    vi.advanceTimersByTime(4000);
    expect(ui.toasts).toHaveLength(0);
  });
});
