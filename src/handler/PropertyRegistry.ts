import { indexer, PropertyRegistry } from "envio";
import { iso1A2Code } from '@rapideditor/country-coder';
import {
  getPropertyTokenRecord,
  calculateWeightedNAVDeviation,
} from '../helper/PropertyToken';
import {
  getGlobalRecord,
  INITIAL_GLOBAL_ENTITY,
  updateGlobalPropertiesCountAndValuation,
} from '../helper/Global';

indexer.onEvent(
  { contract: "PropertyRegistry", event: "IPFSHashChanged" },
  async ({ event, context }) => {
  const propertyTokenLoaded = await context.PropertyToken.get(
    `${event.chainId}-${event.params.property}`
  );
  if (propertyTokenLoaded) {
    Error;
    context.PropertyToken.set({
      ...propertyTokenLoaded,
      ipfs: event.params.newIPFSHash,
    });
  }
}
);

indexer.onEvent(
  { contract: "PropertyRegistry", event: "NameAndSymbolChange" },
  async ({ event, context }) => {
  const propertyTokenLoaded = await context.PropertyToken.get(
    `${event.chainId}-${event.params.property}`
  );
  if (propertyTokenLoaded) {
    context.PropertyToken.set({
      ...propertyTokenLoaded,
      name: event.params.newName,
      symbol: event.params.newSymbol,
    });
  }
}
);

// Todo at historic data tracking
indexer.onEvent(
  { contract: "PropertyRegistry", event: "PropertyBasicInfoChanged" },
  async ({ event, context }) => {
    const [activeProperties, global, propertyTokenLoaded] = await Promise.all([
      context.PropertyToken.getWhere.propertyValuation.gt(0n),
      context.Global.getOrCreate(INITIAL_GLOBAL_ENTITY),
      context.PropertyToken.get(`${event.chainId}-${event.params.property}`),
    ]);

    if (propertyTokenLoaded) {
      const latLngRegex = /(-?\d+(?:\.\d+))(?:,|\s*)\s*(-?\d+(?:\.\d+)?)/g;
      const latLngResult = latLngRegex.exec(event.params.geoLocation);

      if (!latLngResult) throw new Error('Invalid geoLocation');
      const lat = Number(latLngResult[1]);
      const lng = Number(latLngResult[2]);

      if (!lat || !lng) throw new Error('Invalid geoLocation');

      const countryCode = iso1A2Code([lng, lat]) || '';

      const propertyTokenUpdated = {
        ...propertyTokenLoaded,
        streetLocation: event.params.streetLocation,
        geoLocation: event.params.geoLocation,
        lat,
        lng,
        countryCode,
        propertyValuationCurrency: event.params.propertyValuationCurrency,
        propertyValuation: event.params.propertyValuation,
        propertyValuationUpdateTimestamp:
          event.params.propertyValuation !==
          propertyTokenLoaded.propertyValuation
            ? event.block.timestamp
            : propertyTokenLoaded.propertyValuationUpdateTimestamp,
        weightedNAVDeviation: calculateWeightedNAVDeviation(
          propertyTokenLoaded.tokenValuation,
          event.params.propertyValuation,
          propertyTokenLoaded.totalSupply
        ),
      };

      context.PropertyToken.set(propertyTokenUpdated);
      context.PropertyTokenRecord.set(
        getPropertyTokenRecord(propertyTokenUpdated, event.block.timestamp)
      );

      const globalUpdated = updateGlobalPropertiesCountAndValuation(
        global,
        activeProperties,
        propertyTokenUpdated
      );

      context.Global.set(globalUpdated);
      context.GlobalRecord.set(
        getGlobalRecord(globalUpdated, event.block.timestamp)
      );
    }
  }
);

indexer.onEvent(
  { contract: "PropertyRegistry", event: "PropertyInfoAdded" },
  async ({ event, context }) => {
  const propertyTokenLoaded = await context.PropertyToken.get(
    `${event.chainId}-${event.params.property}`
  );
  if (propertyTokenLoaded) {
    context.PropertyToken.set({
      ...propertyTokenLoaded,
      propertyType: event.params.propertyType,
      kadastralMunicipality: event.params.kadastralMunicipality,
      parcelNumber: event.params.parcelNumber,
      buildingPart: Number(event.params.buildingPart),
    });
  }
}
);

indexer.onEvent(
  { contract: "PropertyRegistry", event: "PropertyInfoChanged" },
  async ({ event, context }) => {
  const propertyTokenLoaded = await context.PropertyToken.get(
    `${event.chainId}-${event.params.property}`
  );
  if (propertyTokenLoaded) {
    context.PropertyToken.set({
      ...propertyTokenLoaded,
      propertyType: event.params.propertyType,
      kadastralMunicipality: event.params.kadastralMunicipality,
      parcelNumber: event.params.parcelNumber,
      buildingPart: Number(event.params.buildingPart),
    });
  }
}
);

indexer.onEvent(
  { contract: "PropertyRegistry", event: "PropertyValuationChange" },
  async ({ event, context }) => {
  const [activeProperties, global, propertyTokenLoaded] = await Promise.all([
    context.PropertyToken.getWhere.propertyValuation.gt(0n),
    context.Global.getOrCreate(INITIAL_GLOBAL_ENTITY),
    context.PropertyToken.get(`${event.chainId}-${event.params.property}`),
  ]);

  if (!propertyTokenLoaded) throw new Error('Property token not found');

  const propertyTokenUpdated = {
    ...propertyTokenLoaded,
    propertyValuation: event.params.newValuationProperty,
    propertyValuationUpdateTimestamp:
      event.params.newValuationProperty !==
      propertyTokenLoaded.propertyValuation
        ? event.block.timestamp
        : propertyTokenLoaded.propertyValuationUpdateTimestamp,
    weightedNAVDeviation: calculateWeightedNAVDeviation(
      propertyTokenLoaded.tokenValuation,
      event.params.newValuationProperty,
      propertyTokenLoaded.totalSupply
    ),
  };

  const globalUpdated = updateGlobalPropertiesCountAndValuation(
    global,
    activeProperties,
    propertyTokenUpdated
  );

  context.PropertyToken.set(propertyTokenUpdated);
  context.PropertyTokenRecord.set(
    getPropertyTokenRecord(propertyTokenUpdated, event.block.timestamp)
  );

  context.Global.set(globalUpdated);
  context.GlobalRecord.set(
    getGlobalRecord(globalUpdated, event.block.timestamp)
  );
}
);

indexer.onEvent(
  { contract: "PropertyRegistry", event: "TokenValuationChange" },
  async ({ event, context }) => {
  const propertyTokenLoaded = await context.PropertyToken.getOrThrow(
    `${event.chainId}-${event.params.property}`
  );

  const propertyTokenUpdated = {
    ...propertyTokenLoaded,
    tokenValuation: event.params.newTokenValuation,
    weightedNAVDeviation: calculateWeightedNAVDeviation(
      event.params.newTokenValuation,
      propertyTokenLoaded.propertyValuation,
      propertyTokenLoaded.totalSupply
    ),
  };

  context.PropertyToken.set(propertyTokenUpdated);
  context.PropertyTokenRecord.set(
    getPropertyTokenRecord(propertyTokenUpdated, event.block.timestamp)
  );
}
);
