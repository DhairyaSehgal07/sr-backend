import mongoose from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  AppError,
} from '../../../../utils/errors.js';
import { Farmer } from '../farmer/farmer.model.js';
import { FarmerStorageLink } from './farmer-storage-link.model.js';
import { StoreAdmin } from '../store-admin/store-admin.model.js';
import {
  QuickRegisterFarmerInput,
  UpdateFarmerStorageLinkInput,
} from './farmer-storage-link.schema.js';
import { IncomingGatePass } from '../incoming-gate-pass/incoming-gate-pass.model.js';
import { GradingGatePass } from '../grading-gate-pass/grading-gate-pass.model.js';
import { StorageGatePass } from '../storage-gate-pass/storage-gate-pass.model.js';

/**
 * Retrieves all farmer-storage-links for a cold storage with farmer details populated
 * (name, address, mobileNumber, imageUrl, aadharCardNumber, panCardNumber when present)
 * @param coldStorageId - Cold storage ID
 * @param logger - Optional logger instance
 * @returns Array of farmer-storage-links with populated farmerId
 */
export async function getFarmerStorageLinksByColdStorage(
  coldStorageId: string,
  logger?: FastifyBaseLogger
) {
  try {
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError(
        'Invalid cold storage ID format',
        'INVALID_COLD_STORAGE_ID'
      );
    }

    const links = await FarmerStorageLink.find({
      coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
    })
      .populate(
        'farmerId',
        'name address mobileNumber imageUrl aadharCardNumber panCardNumber createdAt updatedAt'
      )
      .lean();

    logger?.info(
      { coldStorageId, count: links.length },
      'Retrieved farmer-storage-links by cold storage'
    );

    return links;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger?.error(
      { error, coldStorageId },
      'Error retrieving farmer-storage-links by cold storage'
    );

    throw new AppError(
      'Failed to retrieve farmer-storage-links',
      500,
      'GET_FARMER_STORAGE_LINKS_ERROR'
    );
  }
}

/**
 * Retrieves all incoming, grading, and storage gate passes for a single farmer-storage-link
 * with aggregate bag totals scoped to that farmer.
 */
export async function getGatePassesForFarmerStorageLink(
  farmerStorageLinkId: string,
  coldStorageId: string,
  logger?: FastifyBaseLogger
): Promise<{
  incoming: Array<Record<string, unknown>>;
  grading: Array<Record<string, unknown>>;
  storage: Array<Record<string, unknown>>;
  totalIncomingBags: number;
  totalGradingBags: number;
  totalStorageBags: number;
}> {
  try {
    if (!mongoose.Types.ObjectId.isValid(farmerStorageLinkId)) {
      throw new ValidationError(
        'Invalid farmer storage link ID format',
        'INVALID_FARMER_STORAGE_LINK_ID'
      );
    }
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError(
        'Invalid cold storage ID format',
        'INVALID_COLD_STORAGE_ID'
      );
    }

    const linkObjectId = new mongoose.Types.ObjectId(farmerStorageLinkId);
    const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);

    const link = await FarmerStorageLink.findById(linkObjectId)
      .select('coldStorageId _id')
      .lean();

    if (!link) {
      throw new NotFoundError(
        'Farmer storage link not found',
        'FARMER_STORAGE_LINK_NOT_FOUND'
      );
    }

    const linkColdStorageId =
      link.coldStorageId instanceof mongoose.Types.ObjectId
        ? link.coldStorageId
        : (link.coldStorageId as { _id: mongoose.Types.ObjectId })?._id;

    if (
      linkColdStorageId == null ||
      !linkColdStorageId.equals(coldStorageObjectId)
    ) {
      throw new NotFoundError(
        'Farmer storage link not found',
        'FARMER_STORAGE_LINK_NOT_FOUND'
      );
    }

    const linkFilter = { farmerStorageLinkId: linkObjectId };

    const [incoming, grading, storage] = await Promise.all([
      IncomingGatePass.find(linkFilter)
        .populate({
          path: 'farmerStorageLinkId',
          populate: [
            { path: 'farmerId', select: 'name mobileNumber address' },
            { path: 'linkedById', select: 'name' },
          ],
        })
        .populate('createdBy', 'name mobileNumber')
        .sort({ gatePassNo: -1, date: -1 })
        .lean(),
      GradingGatePass.find(linkFilter)
        .populate({
          path: 'farmerStorageLinkId',
          select: 'accountNumber',
          populate: { path: 'farmerId', select: 'name' },
        })
        .populate({
          path: 'incomingGatePassIds',
          select:
            'gatePassNo manualGatePassNumber bagsReceived truckNumber date weightSlip',
        })
        .populate('createdBy', 'name mobileNumber')
        .sort({ gatePassNo: -1, date: -1 })
        .lean(),
      StorageGatePass.find(linkFilter)
        .populate({
          path: 'farmerStorageLinkId',
          select: 'accountNumber farmerId linkedById',
          populate: [
            { path: 'farmerId', select: 'name mobileNumber address' },
            { path: 'linkedById', select: 'name' },
          ],
        })
        .populate({ path: 'createdBy', select: 'name mobileNumber' })
        .sort({ gatePassNo: -1, date: -1 })
        .lean(),
    ]);

    const totalIncomingBags = incoming.reduce(
      (sum, pass) => sum + (pass.bagsReceived ?? 0),
      0
    );

    const totalGradingBags = grading.reduce((sum, pass) => {
      const passBags = (pass.orderDetails ?? []).reduce(
        (detailSum, detail) => detailSum + (detail.quantity ?? 0),
        0
      );
      return sum + passBags;
    }, 0);

    const totalStorageBags = storage.reduce((sum, pass) => {
      const passBags = (pass.bagSizes ?? []).reduce(
        (bagSum, bagSize) => bagSum + (bagSize.initialQuantity ?? 0),
        0
      );
      return sum + passBags;
    }, 0);

    logger?.info(
      {
        farmerStorageLinkId,
        coldStorageId,
        incomingCount: incoming.length,
        gradingCount: grading.length,
        storageCount: storage.length,
        totalIncomingBags,
        totalGradingBags,
        totalStorageBags,
      },
      'Retrieved gate passes for farmer storage link'
    );

    return {
      incoming: incoming as unknown as Array<Record<string, unknown>>,
      grading: grading as unknown as Array<Record<string, unknown>>,
      storage: storage as unknown as Array<Record<string, unknown>>,
      totalIncomingBags,
      totalGradingBags,
      totalStorageBags,
    };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    logger?.error(
      { error, farmerStorageLinkId, coldStorageId },
      'Error retrieving gate passes for farmer storage link'
    );
    throw new AppError(
      'Failed to retrieve gate passes',
      500,
      'GET_GATE_PASSES_ERROR'
    );
  }
}

/**
 * Quick register a farmer and create farmer-storage-link
 */
export async function quickRegisterFarmer(
  payload: QuickRegisterFarmerInput,
  logger?: FastifyBaseLogger
) {
  try {
    const ColdStorage = mongoose.model('ColdStorage');
    const coldStorage = await ColdStorage.findById(payload.coldStorageId);

    if (!coldStorage) {
      logger?.warn(
        { coldStorageId: payload.coldStorageId },
        'Attempt to register farmer for non-existent cold storage'
      );
      throw new NotFoundError(
        'Cold storage not found',
        'COLD_STORAGE_NOT_FOUND'
      );
    }

    const storeAdmin = await StoreAdmin.findById(payload.linkedById);

    if (!storeAdmin) {
      logger?.warn(
        { linkedById: payload.linkedById },
        'Attempt to register farmer with non-existent store admin'
      );
      throw new NotFoundError('Store admin not found', 'STORE_ADMIN_NOT_FOUND');
    }

    const existingFarmer = await Farmer.findOne({
      mobileNumber: payload.mobileNumber,
    });

    if (existingFarmer) {
      const existingLink = await FarmerStorageLink.findOne({
        farmerId: existingFarmer._id,
        coldStorageId: payload.coldStorageId,
      });

      if (existingLink) {
        logger?.warn(
          {
            farmerId: existingFarmer._id,
            coldStorageId: payload.coldStorageId,
          },
          'Attempt to create duplicate farmer-storage-link'
        );
        throw new ConflictError(
          'Farmer is already linked to this cold storage',
          'LINK_ALREADY_EXISTS'
        );
      }

      logger?.warn(
        { mobileNumber: payload.mobileNumber },
        'Attempt to register farmer with existing mobile number'
      );
      throw new ConflictError(
        'Farmer with this mobile number already exists',
        'MOBILE_NUMBER_EXISTS'
      );
    }

    let accountNumber: number;

    if (payload.accountNumber !== undefined) {
      const existingAccountLink = await FarmerStorageLink.findOne({
        coldStorageId: payload.coldStorageId,
        accountNumber: payload.accountNumber,
      });

      if (existingAccountLink) {
        logger?.warn(
          {
            accountNumber: payload.accountNumber,
            coldStorageId: payload.coldStorageId,
          },
          'Attempt to use existing account number'
        );
        throw new ConflictError(
          'Account number already exists for this cold storage',
          'ACCOUNT_NUMBER_EXISTS'
        );
      }

      accountNumber = payload.accountNumber;
    } else {
      const maxAccountLink = await FarmerStorageLink.findOne({
        coldStorageId: payload.coldStorageId,
      })
        .sort({ accountNumber: -1 })
        .select('accountNumber')
        .lean();

      accountNumber = maxAccountLink ? maxAccountLink.accountNumber + 1 : 1;
    }

    const farmer = await Farmer.create({
      name: payload.name,
      address: payload.address,
      mobileNumber: payload.mobileNumber,
      imageUrl: payload.imageUrl || '',
      ...(payload.aadharCardNumber !== undefined && {
        aadharCardNumber: payload.aadharCardNumber,
      }),
      ...(payload.panCardNumber !== undefined && {
        panCardNumber: payload.panCardNumber,
      }),
      password: '123456',
    });

    logger?.info(
      {
        farmerId: farmer._id,
        name: farmer.name,
        mobileNumber: farmer.mobileNumber,
      },
      'Farmer created successfully'
    );

    const farmerStorageLink = await FarmerStorageLink.create({
      farmerId: farmer._id,
      coldStorageId: payload.coldStorageId,
      linkedById: payload.linkedById,
      accountNumber,
      isActive: true,
      ...(payload.costPerBag !== undefined && {
        costPerBag: payload.costPerBag,
      }),
    });

    logger?.info(
      {
        linkId: farmerStorageLink._id,
        farmerId: farmer._id,
        coldStorageId: payload.coldStorageId,
        accountNumber,
      },
      'Farmer-storage-link created successfully'
    );

    const { password: _, ...farmerWithoutPassword } = farmer.toObject();

    return {
      farmer: farmerWithoutPassword,
      farmerStorageLink: farmerStorageLink.toObject(),
    };
  } catch (error) {
    if (
      error instanceof ConflictError ||
      error instanceof ValidationError ||
      error instanceof NotFoundError
    ) {
      throw error;
    }

    if (error instanceof mongoose.Error.ValidationError) {
      const messages = Object.values(error.errors).map((err) => err.message);
      throw new ValidationError(
        messages.join(', '),
        'MONGOOSE_VALIDATION_ERROR'
      );
    }

    if (error instanceof Error && 'code' in error && error.code === 11000) {
      const mongooseError = error as Error & {
        keyPattern?: Record<string, unknown>;
      };
      const field = Object.keys(mongooseError.keyPattern || {})[0] || 'field';
      throw new ConflictError(`${field} already exists`, 'DUPLICATE_KEY_ERROR');
    }

    logger?.error(
      { error, payload },
      'Unexpected error in quick register farmer'
    );

    throw new AppError(
      'Failed to quick register farmer',
      500,
      'QUICK_REGISTER_FARMER_ERROR'
    );
  }
}

/**
 * Updates a farmer-storage-link and associated farmer
 */
export async function updateFarmerStorageLink(
  id: string,
  payload: UpdateFarmerStorageLinkInput,
  logger?: FastifyBaseLogger
) {
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError(
        'Invalid farmer-storage-link ID format',
        'INVALID_ID'
      );
    }

    const farmerStorageLink =
      await FarmerStorageLink.findById(id).populate('farmerId');

    if (!farmerStorageLink) {
      logger?.warn(
        { farmerStorageLinkId: id },
        'Farmer-storage-link not found for update'
      );
      throw new NotFoundError(
        'Farmer-storage-link not found',
        'FARMER_STORAGE_LINK_NOT_FOUND'
      );
    }

    const farmerId = farmerStorageLink.farmerId as mongoose.Types.ObjectId;
    const coldStorageId = farmerStorageLink.coldStorageId;

    if (payload.accountNumber !== undefined) {
      const existingAccountLink = await FarmerStorageLink.findOne({
        coldStorageId: coldStorageId,
        accountNumber: payload.accountNumber,
        _id: { $ne: id },
      });

      if (existingAccountLink) {
        logger?.warn(
          {
            accountNumber: payload.accountNumber,
            coldStorageId: coldStorageId,
            farmerStorageLinkId: id,
          },
          'Attempt to update to existing account number'
        );
        throw new ConflictError(
          'Account number already exists for this cold storage',
          'ACCOUNT_NUMBER_EXISTS'
        );
      }
    }

    if (payload.mobileNumber !== undefined) {
      const existingFarmer = await Farmer.findOne({
        mobileNumber: payload.mobileNumber,
        _id: { $ne: farmerId },
      });

      if (existingFarmer) {
        logger?.warn(
          {
            mobileNumber: payload.mobileNumber,
            farmerId: farmerId,
          },
          'Attempt to update to existing mobile number'
        );
        throw new ConflictError(
          'Farmer with this mobile number already exists',
          'MOBILE_NUMBER_EXISTS'
        );
      }
    }

    if (payload.linkedById !== undefined) {
      const storeAdmin = await StoreAdmin.findById(payload.linkedById);

      if (!storeAdmin) {
        logger?.warn(
          { linkedById: payload.linkedById },
          'Attempt to link to non-existent store admin'
        );
        throw new NotFoundError(
          'Store admin not found',
          'STORE_ADMIN_NOT_FOUND'
        );
      }
    }

    const farmerUpdateData: Partial<{
      name: string;
      address: string;
      mobileNumber: string;
      imageUrl: string;
    }> = {};

    if (payload.name !== undefined) {
      farmerUpdateData.name = payload.name;
    }
    if (payload.address !== undefined) {
      farmerUpdateData.address = payload.address;
    }
    if (payload.mobileNumber !== undefined) {
      farmerUpdateData.mobileNumber = payload.mobileNumber;
    }
    if (payload.imageUrl !== undefined) {
      farmerUpdateData.imageUrl = payload.imageUrl;
    }

    const linkUpdateData: Partial<{
      accountNumber: number;
      isActive: boolean;
      notes: string;
      linkedById: mongoose.Types.ObjectId;
      costPerBag: number;
    }> = {};

    if (payload.accountNumber !== undefined) {
      linkUpdateData.accountNumber = payload.accountNumber;
    }
    if (payload.isActive !== undefined) {
      linkUpdateData.isActive = payload.isActive;
    }
    if (payload.notes !== undefined) {
      linkUpdateData.notes = payload.notes;
    }
    if (payload.linkedById !== undefined) {
      linkUpdateData.linkedById = new mongoose.Types.ObjectId(
        payload.linkedById
      );
    }
    if (payload.costPerBag !== undefined) {
      linkUpdateData.costPerBag = payload.costPerBag;
    }

    let updatedFarmer = null;
    if (Object.keys(farmerUpdateData).length > 0) {
      updatedFarmer = await Farmer.findByIdAndUpdate(
        farmerId,
        farmerUpdateData,
        { new: true, runValidators: true }
      ).lean();

      if (!updatedFarmer) {
        logger?.warn({ farmerId }, 'Farmer not found for update');
        throw new NotFoundError('Farmer not found', 'FARMER_NOT_FOUND');
      }

      delete (updatedFarmer as { password?: string }).password;
    }

    const updatedLink = await FarmerStorageLink.findByIdAndUpdate(
      id,
      linkUpdateData,
      { new: true, runValidators: true }
    )
      .populate('farmerId')
      .lean();

    if (!updatedLink) {
      logger?.warn(
        { farmerStorageLinkId: id },
        'Failed to update farmer-storage-link'
      );
      throw new NotFoundError(
        'Farmer-storage-link not found',
        'FARMER_STORAGE_LINK_NOT_FOUND'
      );
    }

    if (!updatedFarmer) {
      updatedFarmer = await Farmer.findById(farmerId).lean();
      if (updatedFarmer) {
        delete (updatedFarmer as { password?: string }).password;
      }
    }

    logger?.info(
      {
        farmerStorageLinkId: id,
        farmerId: farmerId,
        updates: { ...farmerUpdateData, ...linkUpdateData },
      },
      'Farmer-storage-link updated successfully'
    );

    return {
      farmer: updatedFarmer,
      farmerStorageLink: updatedLink,
    };
  } catch (error) {
    if (
      error instanceof ConflictError ||
      error instanceof ValidationError ||
      error instanceof NotFoundError
    ) {
      throw error;
    }

    if (error instanceof mongoose.Error.ValidationError) {
      const messages = Object.values(error.errors).map((err) => err.message);
      throw new ValidationError(
        messages.join(', '),
        'MONGOOSE_VALIDATION_ERROR'
      );
    }

    if (error instanceof Error && 'code' in error && error.code === 11000) {
      const mongooseError = error as Error & {
        keyPattern?: Record<string, unknown>;
      };
      const field = Object.keys(mongooseError.keyPattern || {})[0] || 'field';
      throw new ConflictError(`${field} already exists`, 'DUPLICATE_KEY_ERROR');
    }

    logger?.error(
      { error, id, payload },
      'Unexpected error in update farmer-storage-link'
    );

    throw new AppError(
      'Failed to update farmer-storage-link',
      500,
      'UPDATE_FARMER_STORAGE_LINK_ERROR'
    );
  }
}
