import { useState } from 'react';

import type { IrrigationOut, ZoneOut } from '../api/types';
import { useStartZoneIrrigation } from '../hooks/queries';
import { messageOf } from '../lib/errors';
import { formatHHMM } from '../lib/format';
import { ConfirmModal } from './ui';

/**
 * Confirmação antes de iniciar uma irrigação pelo app (evita toques acidentais no campo).
 * O app é o ponto de comando da irrigação; o acionamento físico da bomba ainda será integrado.
 */
export function StartIrrigationConfirm({
  zone,
  openIrrigation,
  onClose,
}: {
  zone: ZoneOut | null;
  openIrrigation: IrrigationOut | null;
  onClose: () => void;
}) {
  const { start, isPending } = useStartZoneIrrigation();
  const [error, setError] = useState<string | null>(null);

  const lines: string[] = [];
  if (zone) {
    const duration = openIrrigation?.duration_min ?? 45;
    lines.push(`A irrigação começa agora e dura ${duration} minutos. Você pode encerrar antes pela aba Irrigação.`);
    if (openIrrigation) {
      lines.push(`Substitui a irrigação que estava prevista para ${formatHHMM(openIrrigation.scheduled_at)}.`);
    }
    if (zone.status === 'offline' || zone.status === 'no_data') {
      lines.push('Atenção: o sensor desta zona está sem leitura recente.');
    } else if (zone.status === 'wet') {
      lines.push(`Atenção: o solo já está úmido (${Math.round(zone.last_moisture_pct ?? 0)}%).`);
    }
  }
  if (error) lines.push(error);

  function close() {
    setError(null);
    onClose();
  }

  async function confirm() {
    if (!zone) return;
    setError(null);
    try {
      await start(zone.id, openIrrigation?.id ?? null);
      close();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <ConfirmModal
      visible={zone !== null}
      title={zone ? `Iniciar irrigação de ${zone.name}?` : ''}
      message={lines.join('\n\n')}
      confirmLabel="Iniciar"
      loading={isPending}
      onConfirm={() => void confirm()}
      onCancel={close}
    />
  );
}
