import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;

/**
 * Only a SHA-256 hash of the refresh token is stored, so a database leak
 * does not leak usable sessions. Tokens belong to a "family": presenting an
 * already-rotated token revokes the whole family (reuse / theft detection).
 */
@Schema({ timestamps: true })
export class RefreshToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  tokenHash!: string;

  @Prop({ required: true, index: true })
  familyId!: string;

  /** TTL index: MongoDB deletes expired records automatically. */
  @Prop({ required: true, index: { expires: 0 } })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  @Prop({ type: String, default: null })
  replacedByTokenHash!: string | null;

  @Prop({ trim: true, maxlength: 512, default: '' })
  userAgent!: string;

  @Prop({ trim: true, maxlength: 64, default: '' })
  ip!: string;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);
