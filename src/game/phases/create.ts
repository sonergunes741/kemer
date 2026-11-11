/** The flow's one switch: which phase a step starts. */
import type { Phase, Step } from '../types';
import { ArrivePhase } from './arrive';
import type { GameContext } from './base';
import { BuildPhase } from './build';
import { DesignPhase } from './design';
import { EpiloguePhase } from './epilogue';
import { FallPhase } from './fall';
import { ResultPhase } from './result';
import { StrikePhase } from './strike';
import { TimePhase } from './time';
import { TitlePhase } from './title';

export function createPhase(step: Step, g: GameContext, boot: boolean): Phase {
  switch (step.to) {
    case 'title':
      return new TitlePhase(g, boot);
    case 'arrive':
      return new ArrivePhase(g);
    case 'design':
      return new DesignPhase(g);
    case 'build':
      return new BuildPhase(g);
    case 'strike':
      return new StrikePhase(g);
    case 'time':
      return new TimePhase(g);
    case 'fall':
      return new FallPhase(g, step.info, step.years);
    case 'result':
      return new ResultPhase(g);
    case 'epilogue':
      return new EpiloguePhase(g);
  }
}
