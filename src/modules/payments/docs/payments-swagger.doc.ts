import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import * as SYS_MSG from '../../../constants/system.messages';
import { InitiateSubscriptionRequestDto } from '../dto/initiate-subscription-request.dto';

export function InitiatePaymentDocs() {
  return applyDecorators(
    ApiOperation({ summary: 'Initiate a Pro plan one-time payment' }),
    ApiResponse({
      status: HttpStatus.CREATED,
      description: 'Payment session created. Redirect the user to authorizationUrl to complete payment.',
      schema: {
        example: {
          statusCode: 201,
          message: SYS_MSG.PAYMENT_INITIATED_SUCCESSFULLY,
          data: {
            reference: '550e8400-e29b-41d4-a716-446655440000',
            authorizationUrl: 'https://checkout.paystack.com/0peioxfhpn',
            amount: 900000,
            currency: 'NGN',
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.CONFLICT, description: 'User is already on the Pro plan, or a payment for this request is already in progress.' }),
    ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded — max 5 initiations per hour per user.' }),
    ApiResponse({ status: HttpStatus.PAYMENT_REQUIRED, description: 'Provider declined the payment.' }),
    ApiResponse({ status: HttpStatus.BAD_GATEWAY, description: 'Payment provider is unavailable or returned an unexpected error.' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid JWT. Handled by the global AuthGuard.' }),
  );
}

export function InitiateSubscriptionDocs() {
  return applyDecorators(
    ApiOperation({ summary: 'Initiate a Pro plan subscription checkout' }),
    ApiBody({ type: InitiateSubscriptionRequestDto }),
    ApiResponse({
      status: HttpStatus.CREATED,
      description: 'Subscription checkout created. Redirect the user to authorizationUrl.',
      schema: {
        example: {
          statusCode: 201,
          message: SYS_MSG.SUBSCRIPTION_INITIATED_SUCCESSFULLY,
          data: {
            authorizationUrl: 'https://checkout.paystack.com/0peioxfhpn',
            amount: 300000,
            currency: 'NGN',
            billingCycle: 'monthly',
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.CONFLICT, description: 'User already has an active or pending subscription.' }),
    ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded — max 5 initiations per hour.' }),
    ApiResponse({ status: HttpStatus.PAYMENT_REQUIRED, description: 'Provider declined the request.' }),
    ApiResponse({ status: HttpStatus.BAD_GATEWAY, description: 'Payment provider unavailable or returned an unexpected error.' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid JWT. Handled by the global AuthGuard.' }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Invalid billingCycle value.',
      schema: {
        example: {
          statusCode: 400,
          error: 'Bad Request',
          message: SYS_MSG.VALIDATION_FAILED,
          details: ['billingCycle must be one of the following values: monthly, annual'],
        },
      },
    }),
  );
}

export function VerifyPaymentDocs() {
  return applyDecorators(
    ApiOperation({ summary: 'Verify a payment and activate Pro access on success' }),
    ApiQuery({ name: 'reference', required: true, description: 'UUID v4 provider reference returned by the initiate endpoint' }),
    ApiResponse({ status: HttpStatus.OK, description: 'Payment status resolved (success | failed | pending | refunded).' }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'reference is not a valid UUID v4.' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid JWT.' }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Reference not found or belongs to a different user.' }),
    ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Gateway amount does not match the expected price.' }),
    ApiResponse({ status: HttpStatus.BAD_GATEWAY, description: 'Payment provider returned an error.' }),
    ApiResponse({ status: HttpStatus.GATEWAY_TIMEOUT, description: 'Payment provider did not respond in time.' }),
  );
}
