import 'server-only';

// Compatibility facade for existing server imports. All provider behavior now lives
// in isolated adapters under lib/ai-providers/ and is shared by the central router.
export * from './ai-providers/index';
