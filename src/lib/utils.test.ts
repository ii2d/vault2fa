import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn utility', () => {
  it('merges class names correctly', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('handles conditional classes', () => {
    const isActive = true;
    const isHidden = false;
    expect(cn('base', isActive && 'is-active', isHidden && 'is-hidden')).toBe('base is-active');
  });

  it('resolves conflicting tailwind classes', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
  });
});
