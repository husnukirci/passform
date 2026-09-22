// Constrain, then rank (ADR 4): the domain builds the body, this service
// runs it against the alias and turns every hit into a fit verdict using
// the nested rows Elasticsearch matched. No fit reason is produced here.

import type { Client, estypes } from "@elastic/elasticsearch";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { SearchHitDto, SearchQuery, SearchResponse } from "@passform/contracts";
import {
  type Axle,
  buildSearchQuery,
  evaluateFit,
  PAGE_SIZE,
  type VehicleVariant,
} from "@passform/domain";

import { VehiclesRepository } from "../vehicles/vehicles.repository.js";
import { aliasName } from "./alias.js";
import {
  documentToFitment,
  documentToHit,
  type FitmentDocument,
  type HitSource,
} from "./documents.js";
import { ES_CLIENT } from "./search-infra.module.js";

@Injectable()
export class SearchService {
  constructor(
    @Inject(ES_CLIENT) private readonly es: Client,
    private readonly vehicles: VehiclesRepository,
  ) {}

  async search(input: SearchQuery): Promise<SearchResponse> {
    const variant = await this.vehicles.findById(input.variantId);
    if (variant === null) throw new NotFoundException(`vehicle ${input.variantId} not found`);

    const body = buildSearchQuery({
      variant,
      ...(input.q !== undefined && { q: input.q }),
      ...(input.category !== undefined && { categorySlug: input.category }),
      ...(input.brand !== undefined && { brand: input.brand }),
      axle: input.axle ?? null,
      sort: input.sort,
      page: input.page,
    });
    const response = await this.es.search<HitSource>({ index: aliasName(), ...body });

    const hits = response.hits.hits.map((hit) => toHit(hit, variant, input.axle ?? null));
    return {
      hits,
      stages: { fitted: totalOf(response.hits.total), shown: hits.length },
      page: input.page,
      pageSize: PAGE_SIZE,
    };
  }
}

function toHit(
  hit: estypes.SearchHit<HitSource>,
  variant: VehicleVariant,
  axle: Axle | null,
): SearchHitDto {
  if (hit._id === undefined || hit._source === undefined) {
    throw new Error(`search hit without _id or _source: ${JSON.stringify(hit)}`);
  }
  const part = documentToHit(hit._id, hit._source);
  // Only the rows that passed the nested filter come back; a universal part has none.
  const rows: estypes.SearchHit<FitmentDocument>[] = hit.inner_hits?.fitments?.hits.hits ?? [];
  const matched = rows.flatMap((row) =>
    row._source === undefined ? [] : [documentToFitment(row._source)],
  );
  return { ...part, fit: evaluateFit(variant, part, matched, axle) };
}

function totalOf(total: estypes.SearchHitsMetadata["total"]): number {
  if (total === undefined) return 0;
  return typeof total === "number" ? total : total.value;
}
