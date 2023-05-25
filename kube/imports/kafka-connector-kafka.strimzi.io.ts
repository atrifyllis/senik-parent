// generated by cdk8s
import { ApiObject, ApiObjectMetadata, GroupVersionKind } from 'cdk8s';
import { Construct } from 'constructs';


/**
 *
 *
 * @schema KafkaConnector
 */
export class KafkaConnector extends ApiObject {
  /**
   * Returns the apiVersion and kind for "KafkaConnector"
   */
  public static readonly GVK: GroupVersionKind = {
    apiVersion: 'kafka.strimzi.io/v1beta2',
    kind: 'KafkaConnector',
  }

  /**
   * Renders a Kubernetes manifest for "KafkaConnector".
   *
   * This can be used to inline resource manifests inside other objects (e.g. as templates).
   *
   * @param props initialization props
   */
  public static manifest(props: KafkaConnectorProps = {}): any {
    return {
      ...KafkaConnector.GVK,
      ...toJson_KafkaConnectorProps(props),
    };
  }

  /**
   * Defines a "KafkaConnector" API object
   * @param scope the scope in which to define this object
   * @param id a scope-local name for the object
   * @param props initialization props
   */
  public constructor(scope: Construct, id: string, props: KafkaConnectorProps = {}) {
    super(scope, id, {
      ...KafkaConnector.GVK,
      ...props,
    });
  }

  /**
   * Renders the object to Kubernetes JSON.
   */
  public toJson(): any {
    const resolved = super.toJson();

    return {
      ...KafkaConnector.GVK,
      ...toJson_KafkaConnectorProps(resolved),
    };
  }
}

/**
 * @schema KafkaConnector
 */
export interface KafkaConnectorProps {
  /**
   * @schema KafkaConnector#metadata
   */
  readonly metadata?: ApiObjectMetadata;

  /**
   * The specification of the Kafka Connector.
   *
   * @schema KafkaConnector#spec
   */
  readonly spec?: KafkaConnectorSpec;

}

/**
 * Converts an object of type 'KafkaConnectorProps' to JSON representation.
 */
/* eslint-disable max-len, quote-props */
export function toJson_KafkaConnectorProps(obj: KafkaConnectorProps | undefined): Record<string, any> | undefined {
  if (obj === undefined) { return undefined; }
  const result = {
    'metadata': obj.metadata,
    'spec': toJson_KafkaConnectorSpec(obj.spec),
  };
  // filter undefined values
  return Object.entries(result).reduce((r, i) => (i[1] === undefined) ? r : ({ ...r, [i[0]]: i[1] }), {});
}
/* eslint-enable max-len, quote-props */

/**
 * The specification of the Kafka Connector.
 *
 * @schema KafkaConnectorSpec
 */
export interface KafkaConnectorSpec {
  /**
   * The Class for the Kafka Connector.
   *
   * @schema KafkaConnectorSpec#class
   */
  readonly class?: string;

  /**
   * The maximum number of tasks for the Kafka Connector.
   *
   * @schema KafkaConnectorSpec#tasksMax
   */
  readonly tasksMax?: number;

  /**
   * Automatic restart of connector and tasks configuration.
   *
   * @schema KafkaConnectorSpec#autoRestart
   */
  readonly autoRestart?: KafkaConnectorSpecAutoRestart;

  /**
   * The Kafka Connector configuration. The following properties cannot be set: connector.class, tasks.max.
   *
   * @schema KafkaConnectorSpec#config
   */
  readonly config?: any;

  /**
   * Whether the connector should be paused. Defaults to false.
   *
   * @default false.
   * @schema KafkaConnectorSpec#pause
   */
  readonly pause?: boolean;

}

/**
 * Converts an object of type 'KafkaConnectorSpec' to JSON representation.
 */
/* eslint-disable max-len, quote-props */
export function toJson_KafkaConnectorSpec(obj: KafkaConnectorSpec | undefined): Record<string, any> | undefined {
  if (obj === undefined) { return undefined; }
  const result = {
    'class': obj.class,
    'tasksMax': obj.tasksMax,
    'autoRestart': toJson_KafkaConnectorSpecAutoRestart(obj.autoRestart),
    'config': obj.config,
    'pause': obj.pause,
  };
  // filter undefined values
  return Object.entries(result).reduce((r, i) => (i[1] === undefined) ? r : ({ ...r, [i[0]]: i[1] }), {});
}
/* eslint-enable max-len, quote-props */

/**
 * Automatic restart of connector and tasks configuration.
 *
 * @schema KafkaConnectorSpecAutoRestart
 */
export interface KafkaConnectorSpecAutoRestart {
  /**
   * Whether automatic restart for failed connectors and tasks should be enabled or disabled.
   *
   * @schema KafkaConnectorSpecAutoRestart#enabled
   */
  readonly enabled?: boolean;

}

/**
 * Converts an object of type 'KafkaConnectorSpecAutoRestart' to JSON representation.
 */
/* eslint-disable max-len, quote-props */
export function toJson_KafkaConnectorSpecAutoRestart(obj: KafkaConnectorSpecAutoRestart | undefined): Record<string, any> | undefined {
  if (obj === undefined) { return undefined; }
  const result = {
    'enabled': obj.enabled,
  };
  // filter undefined values
  return Object.entries(result).reduce((r, i) => (i[1] === undefined) ? r : ({ ...r, [i[0]]: i[1] }), {});
}
/* eslint-enable max-len, quote-props */
