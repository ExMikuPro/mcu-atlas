import type { z } from 'zod';
import type { Source } from '../../schemas/device';
import type { Document, DocumentRevision, documentScope } from '../../schemas/document';

export type ReadSource = (url: string) => Promise<string>;

export interface DeviceMatch {
  model: string;
  device: string;
  family: string;
  kind: 'device' | 'orderable_part' | 'pack_variant';
  source: Source;
}

export interface DocumentFinding extends DocumentRevision {
  id?: string;
  type?: Document['type'];
  title: string;
  reference?: string;
  scope: z.infer<typeof documentScope>;
  source: Source;
  verified: boolean;
}

export interface Adapter {
  findDevice(model: string): DeviceMatch | null;
  getDocuments(device: DeviceMatch): DocumentFinding[];
}

export interface SourceCollector<Result> {
  collect(read: ReadSource, observedAt: string): Promise<Result>;
}
