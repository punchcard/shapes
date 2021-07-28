import 'jest';

import { DSL } from './dsl';
import { Update } from './update';
import { MyType } from './mock';

const _ = DSL.of(MyType);

test('enumProperty = literal', () => {
  expect(Update.compile([
    _.direction.set('UP')
  ])).toEqual({
    UpdateExpression: 'SET #1=:1',
    ExpressionAttributeNames: {
      '#1': 'direction'
    },
    ExpressionAttributeValues: {
      ':1': {
        S: 'UP'
      }
    },
  });
});

test('enumProperty = reference', () => {
  expect(Update.compile([
    _.direction.set(_.direction)
  ])).toEqual({
    UpdateExpression: 'SET #1=#1',
    ExpressionAttributeNames: {
      '#1': 'direction'
    }
  });
});

test('stringProperty = stringLiteral', () => {
  expect(Update.compile([
    _.id.set('value')
  ])).toEqual({
    UpdateExpression: 'SET #1=:1',
    ExpressionAttributeNames: {
      '#1': 'id'
    },
    ExpressionAttributeValues: {
      ':1': {
        S: 'value'
      }
    },
  });
});

test('repeated clauses', () => {
  expect(Update.compile([
    _.id.set('value'),
    _.id.set('value'),
  ])).toEqual({
    UpdateExpression: 'SET #1=:1, #1=:2',
    ExpressionAttributeNames: {
      '#1': 'id'
    },
    ExpressionAttributeValues: {
      ':1': {
        S: 'value'
      },
      ':2': {
        S: 'value'
      }
    },
  });
});

test('list-push', () => {
  expect(Update.compile([
    _.array.push('value')
  ])).toEqual({
    UpdateExpression: 'SET #1[1]=:1',
    ExpressionAttributeNames: {
      '#1': 'array'
    },
    ExpressionAttributeValues: {
      ':1': {
        S: 'value'
      }
    },
  });
});

test('list-append', () => {
  expect(Update.compile([
    _.array.concat(['value'])
  ])).toEqual({
    UpdateExpression: 'SET #1=list_append(#1,:1)',
    ExpressionAttributeNames: {
      '#1': 'array'
    },
    ExpressionAttributeValues: {
      ':1': {
        L: [{
          S: 'value'
        }]
      }
    },
  });
});

test('increment', () => {
  expect(Update.compile([
    _.count.increment()
  ])).toEqual({
    UpdateExpression: 'SET #1=#1+:1',
    ExpressionAttributeNames: {
      '#1': 'count'
    },
    ExpressionAttributeValues: {
      ':1': {
        N: '1'
      }
    }
  });
});
