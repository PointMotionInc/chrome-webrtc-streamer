type DeviceInfo = {
  cpu: {
    model: string;
    architecture: string;
    numberOfProcessors: number;
  };
  storage: {
    capacity: number;
  };
  memory: {
    capacity: number;
    availableCapacity: number;
  };
  display: {
    workareaDimensions: {
      width: number;
      height: number;
    };
    dimensions: {
      width: number;
      height: number;
    };
    isPrimary: boolean;
  };
};
