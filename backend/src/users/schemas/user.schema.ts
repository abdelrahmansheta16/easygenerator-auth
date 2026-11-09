import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  /** Normalized (trimmed, lowercased) before it ever reaches the database. */
  @Prop({
    required: true,
    unique: true,
    index: true,
    trim: true,
    lowercase: true,
  })
  email!: string;

  @Prop({ required: true, trim: true, minlength: 3, maxlength: 100 })
  name!: string;

  /** Argon2id hash. `select: false` keeps it out of default query results. */
  @Prop({ required: true, select: false })
  passwordHash!: string;

  /** Brute-force defence: consecutive failures and temporary lock timestamp. */
  @Prop({ default: 0, select: false })
  failedLoginAttempts!: number;

  @Prop({ type: Date, default: null, select: false })
  lockedUntil!: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
