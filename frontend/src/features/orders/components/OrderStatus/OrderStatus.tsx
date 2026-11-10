import type { OrderStatus as Status } from '../../../../types/api.types';
import { classNames } from '../../../../utils/classNames';
import { STATUS_LABEL, STATUS_TONE } from '../../orderStatus';
import styles from './OrderStatus.module.scss';

/** The status as words (never only a colour). */
export function OrderStatus({ status }: { status: Status }) {
  return (
    <span className={classNames(styles.badge, styles[STATUS_TONE[status]])}>
      {STATUS_LABEL[status]}
    </span>
  );
}
