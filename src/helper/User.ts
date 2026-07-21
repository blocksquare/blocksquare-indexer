import { User } from "envio";

export const getNewUser = (chainId: number, userId: string): User => {
  return {
    id: `${chainId}-${userId}`,
    chainId,
  };
};
