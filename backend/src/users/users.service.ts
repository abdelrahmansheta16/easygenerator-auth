import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /** Public profile lookup (never selects the password hash). */
  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  /** Auth-only lookup that explicitly selects the hidden credential fields. */
  async findByEmailWithCredentials(
    email: string,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email })
      .select('+passwordHash +failedLoginAttempts +lockedUntil')
      .exec();
  }

  async create(input: {
    email: string;
    name: string;
    passwordHash: string;
  }): Promise<UserDocument> {
    return this.userModel.create(input);
  }

  async recordFailedLogin(
    userId: string,
    lockThreshold: number,
    lockMinutes: number,
  ): Promise<void> {
    const user = await this.userModel
      .findById(userId)
      .select('+failedLoginAttempts +lockedUntil')
      .exec();
    if (!user) return;
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= lockThreshold) {
      user.lockedUntil = new Date(Date.now() + lockMinutes * 60_000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
  }

  async resetFailedLogins(userId: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId },
        { $set: { failedLoginAttempts: 0, lockedUntil: null } },
      )
      .exec();
  }
}
