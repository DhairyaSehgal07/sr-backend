import { Preferences } from './preferences.model.js';
import { ColdStorage } from '../cold-storage/cold-storage.model.js';
import type { UpdatePreferencesInput } from './preferences.schema.js';
import { NotFoundError, ValidationError } from '../../../../utils/errors.js';
import mongoose from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Get preferences for a cold storage by cold storage ID
 */
export async function getPreferencesByColdStorageId(
  coldStorageId: string,
  logger?: FastifyBaseLogger
) {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError('Invalid cold storage ID format', 'INVALID_ID');
  }

  const coldStorage = await ColdStorage.findById(coldStorageId);
  if (!coldStorage) {
    throw new NotFoundError('Cold storage not found', 'COLD_STORAGE_NOT_FOUND');
  }

  const preferences = await Preferences.findOne({
    coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
  }).lean();

  if (!preferences) {
    throw new NotFoundError(
      'Preferences not found for this cold storage',
      'PREFERENCES_NOT_FOUND'
    );
  }

  logger?.info({ coldStorageId }, 'Retrieved preferences');
  return preferences;
}

/**
 * Update preferences for a cold storage
 */
export async function updatePreferences(
  coldStorageId: string,
  payload: UpdatePreferencesInput,
  logger?: FastifyBaseLogger
) {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError('Invalid cold storage ID format', 'INVALID_ID');
  }

  const coldStorage = await ColdStorage.findById(coldStorageId);
  if (!coldStorage) {
    throw new NotFoundError('Cold storage not found', 'COLD_STORAGE_NOT_FOUND');
  }

  const preferences = await Preferences.findOneAndUpdate(
    { coldStorageId: new mongoose.Types.ObjectId(coldStorageId) },
    { $set: payload },
    { new: true, runValidators: true }
  ).lean();

  if (!preferences) {
    throw new NotFoundError(
      'Preferences not found for this cold storage',
      'PREFERENCES_NOT_FOUND'
    );
  }

  logger?.info({ coldStorageId }, 'Preferences updated');
  return preferences;
}
