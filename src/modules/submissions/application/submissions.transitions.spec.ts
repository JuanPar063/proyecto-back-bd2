import { BadRequestException } from '@nestjs/common';
import { SubmissionStatus } from '@prisma/client';
import {
  assertValidTransition,
  TERMINAL_STATUSES,
} from './submissions.service';

describe('assertValidTransition', () => {
  it('permite QUEUED -> RUNNING', () => {
    expect(() =>
      assertValidTransition(SubmissionStatus.QUEUED, SubmissionStatus.RUNNING),
    ).not.toThrow();
  });

  it.each(TERMINAL_STATUSES)(
    'permite RUNNING -> %s (terminal)',
    (terminal) => {
      expect(() =>
        assertValidTransition(SubmissionStatus.RUNNING, terminal),
      ).not.toThrow();
    },
  );

  it('rechaza QUEUED -> ACCEPTED (debe pasar por RUNNING)', () => {
    expect(() =>
      assertValidTransition(
        SubmissionStatus.QUEUED,
        SubmissionStatus.ACCEPTED,
      ),
    ).toThrow(BadRequestException);
  });

  it.each(TERMINAL_STATUSES)(
    'rechaza salida desde estado terminal (%s -> ACCEPTED)',
    (terminal) => {
      expect(() =>
        assertValidTransition(terminal, SubmissionStatus.ACCEPTED),
      ).toThrow(BadRequestException);
    },
  );

  it('rechaza RUNNING -> QUEUED (no se puede des-encolar)', () => {
    expect(() =>
      assertValidTransition(
        SubmissionStatus.RUNNING,
        SubmissionStatus.QUEUED,
      ),
    ).toThrow(BadRequestException);
  });
});
