import { useAuth } from '../context/AuthContext';

/**
 * Centralized creator-restriction logic.
 *
 * Currently handles only Temporary Deactivation for verified Child Creators.
 * Extensible for future restriction types — add new boolean fields here and
 * expose them via the returned object so all consumers stay in sync.
 */
export interface CreatorRestrictions {
  /** True when the creator should be frozen on the Verification page. */
  isFrozen: boolean;
  /** Human-readable reason shown in the deactivation banner. */
  freezeReason: string | null;
}

export function useCreatorRestrictions(): CreatorRestrictions {
  const { creator } = useAuth();

  // Only child creators can be temporarily deactivated.
  // Mother Creators and Super Admins are never frozen.
  if (
    creator &&
    !creator.is_super_admin &&
    !creator.is_content_master &&
    creator.is_temporarily_deactivated
  ) {
    return {
      isFrozen: true,
      freezeReason:
        'Your account has been temporarily deactivated by an administrator. Portal access is restricted. Please contact support for more information.',
    };
  }

  return { isFrozen: false, freezeReason: null };
}
