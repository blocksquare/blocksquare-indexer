import { SECONDS_PER_DAY, SECONDS_PER_HOUR } from './constants';
import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import duration from 'dayjs/plugin/duration';

dayjs.extend(utc);
dayjs.extend(duration);

type Day = {
  id: number;
  start: number;
};

export const getDay = (timestamp: number): Day => {
  const dayId = Math.trunc(timestamp / SECONDS_PER_DAY);
  return {
    id: dayId,
    start: dayId * SECONDS_PER_DAY,
  };
};

export const getHour = (timestamp: number): Day => {
  const dayId = Math.trunc(timestamp / SECONDS_PER_HOUR);
  return {
    id: dayId,
    start: dayId * SECONDS_PER_HOUR,
  };
};

export const convertUnixToDate = (unixTimestamp: number): Dayjs => {
  return dayjs.unix(unixTimestamp).utc();
};

export const getRangeOfDays = (fromDate: Dayjs, toDate: Dayjs): number => {
  const from = fromDate.startOf('day');
  const to = toDate.startOf('day');
  return Math.abs(from.diff(to, 'days')) + 1;
};
