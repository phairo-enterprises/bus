export const empty = () => ({head:null, pending:[], history:[]});
export function propose(state, phase, dimension, value, rationale) {
  if (!['timely','timeless'].includes(phase) || !Number.isInteger(value) || value<0 || value>4 || !rationale.trim()) throw Error('Supply a rating and its basis.');
  const base = state.head.input[phase].criteria.find(c => c.id === dimension);
  if (!base) throw Error('Unknown dimension');
  return {...state,pending:[...state.pending.filter(p=>p.phase!==phase || p.dimension!==dimension),
    {phase,dimension,value,rationale,base:JSON.stringify(base),at:new Date().toISOString()}]};
}
export function reconcile(state, head) {
  if (state.head && head.revision <= state.head.revision) {
    if (head.revision===state.head.revision && JSON.stringify(head)!==JSON.stringify(state.head)) throw Error('Conflicting authority revision');
    return state;
  }
  const pending=[], history=[...state.history];
  for(const draft of state.pending){
    const current=head.input[draft.phase].criteria.find(c=>c.id===draft.dimension);
    if(state.head.input.taskId===head.input.taskId && current && JSON.stringify(current)===draft.base) pending.push(draft);
    else history.push({draft,correctedTo:current??null,revision:head.revision,task:head.input.taskId});
  }
  return {head,pending,history};
}
export function project(state) {
  const input=structuredClone(state.head.input);
  for(const p of state.pending){
    const criterion=input[p.phase].criteria.find(c=>c.id===p.dimension);
    Object.assign(criterion,{state:'scored',value:p.value,rationale:p.rationale,evidence:['Local provisional observation']});
  }
  return input;
}
