import { supabase } from '@/api/supabaseClient';
/**
import { User } from '@/api/entities';
 * userStatus.js
import { User } from '@/api/entities';
 * Single source of truth for user lifecycle checks in ConstructIQ.
import { User } from '@/api/entities';
 * All components and functions should use these helpers.
import { User } from '@/api/entities';
 *
import { User } from '@/api/entities';
 * Three states:
import { User } from '@/api/entities';
 *   Active      — user.disabled is falsy
import { User } from '@/api/entities';
 *   Deactivated — user.disabled === true
import { User } from '@/api/entities';
 *   Reactivated — previously deactivated, now active (disabled set back to false)
import { User } from '@/api/entities';
 */
import { User } from '@/api/entities';

import { User } from '@/api/entities';
/**
import { User } from '@/api/entities';
 * Returns true if the user is allowed to access the system.
import { User } from '@/api/entities';
 * @param {object|null} user - User record from User or supabase.auth.getUser()
import { User } from '@/api/entities';
 */
import { User } from '@/api/entities';
export function isUserActive(user) {
import { User } from '@/api/entities';
  if (!user) return false;
import { User } from '@/api/entities';
  return user.data?.disabled !== true;
import { User } from '@/api/entities';
}
import { User } from '@/api/entities';

import { User } from '@/api/entities';
/**
import { User } from '@/api/entities';
 * Returns true if the user is deactivated.
import { User } from '@/api/entities';
 * @param {object|null} user
import { User } from '@/api/entities';
 */
import { User } from '@/api/entities';
export function isUserDeactivated(user) {
import { User } from '@/api/entities';
  if (!user) return false;
import { User } from '@/api/entities';
  return user.data?.disabled === true;
import { User } from '@/api/entities';
}
import { User } from '@/api/entities';

import { User } from '@/api/entities';
/**
import { User } from '@/api/entities';
 * Filters an array of user objects to only active users.
import { User } from '@/api/entities';
 * Safe to call with null/undefined — returns [].
import { User } from '@/api/entities';
 * @param {Array} users
import { User } from '@/api/entities';
 */
import { User } from '@/api/entities';
export function filterActiveUsers(users) {
import { User } from '@/api/entities';
  if (!Array.isArray(users)) return [];
import { User } from '@/api/entities';
  return users.filter(u => isUserActive(u));
import { User } from '@/api/entities';
}
import { User } from '@/api/entities';
